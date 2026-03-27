const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// Empêcher les crashs silencieux
process.on('uncaughtException', (error) => {
  console.error('[DentaStock] Erreur non capturee:', error)
  try {
    if (db) saveDatabase()
  } catch { /* ignore */ }
  dialog.showErrorBox('Erreur inattendue', `${error.message}\n\nL'application va continuer mais un redemarrage est recommande.`)
})

process.on('unhandledRejection', (reason) => {
  console.error('[DentaStock] Promesse rejetee:', reason)
})

const DB_FILENAME = 'dentastock.db'
const LOCK_STALE_MS = 30_000

let SQL = null
let db = null
let mainWindow = null
let dbPath = ''
let dbFileMtime = 0
let dbConfigFile = ''
let storageConfigFile = ''
let inWriteTransaction = false

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

function readTextFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  return fs.readFileSync(filePath, 'utf-8').trim()
}

function writeTextFile(filePath, value) {
  ensureDirectory(path.dirname(filePath))
  fs.writeFileSync(filePath, String(value || ''), 'utf-8')
}

function getUserDataPath() {
  return app.getPath('userData')
}

function getDefaultDbPath() {
  return path.join(getUserDataPath(), 'data', DB_FILENAME)
}

function getDefaultDocumentsRoot() {
  return path.join(getUserDataPath(), 'documents')
}

function getConfiguredStorageRoot() {
  return readTextFile(storageConfigFile)
}

function getActiveDocumentsRoot() {
  const storageRoot = getConfiguredStorageRoot()
  return storageRoot
    ? path.join(storageRoot, 'documents')
    : getDefaultDocumentsRoot()
}

function getStorageStatus(extra = {}) {
  const storageRoot = getConfiguredStorageRoot()
  return {
    mode: storageRoot ? 'shared' : 'local',
    storageRoot: storageRoot || null,
    dbPath,
    dbDirectory: dbPath ? path.dirname(dbPath) : null,
    documentsPath: getActiveDocumentsRoot(),
    ...extra,
  }
}

function getDiskMtime(targetPath = dbPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return 0
  return fs.statSync(targetPath).mtimeMs
}

function closeDatabase() {
  if (!db || typeof db.close !== 'function') return
  try {
    db.close()
  } catch {
    // ignore close errors, sql.js will recreate the database instance.
  }
}

function loadDatabaseFromFile(targetPath) {
  ensureDirectory(path.dirname(targetPath))
  closeDatabase()

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
    db = new SQL.Database(fs.readFileSync(targetPath))
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  dbFileMtime = getDiskMtime(targetPath)
}

function saveDatabase() {
  ensureDirectory(path.dirname(dbPath))
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
  dbFileMtime = getDiskMtime(dbPath)
}

function refreshDatabaseIfNeeded(force = false) {
  if (inWriteTransaction || !dbPath) return

  const diskMtime = getDiskMtime()
  if (force || (diskMtime && diskMtime > dbFileMtime + 1)) {
    loadDatabaseFromFile(dbPath)
    ensureSchema()
  }
}

function maybeRemoveStaleLock(lockPath) {
  if (!fs.existsSync(lockPath)) return

  const age = Date.now() - fs.statSync(lockPath).mtimeMs
  if (age > LOCK_STALE_MS) {
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // ignore stale lock cleanup errors
    }
  }
}

async function acquireWriteLock(targetPath = dbPath, timeoutMs = 10_000) {
  const lockPath = `${targetPath}.lock`
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    maybeRemoveStaleLock(lockPath)

    try {
      const fd = fs.openSync(lockPath, 'wx')
      fs.writeFileSync(fd, String(process.pid))

      return () => {
        try {
          fs.closeSync(fd)
        } catch {
          // ignore
        }

        try {
          if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
        } catch {
          // ignore
        }
      }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      await wait(150)
    }
  }

  throw new Error('La base de donnees est deja utilisee par un autre poste. Reessayez dans quelques secondes.')
}

async function withWriteTransaction(work) {
  const release = await acquireWriteLock()

  try {
    loadDatabaseFromFile(dbPath)
    ensureSchema()

    inWriteTransaction = true
    db.run('BEGIN')

    try {
      const result = work()
      db.run('COMMIT')
      saveDatabase()
      return result
    } catch (error) {
      try {
        db.run('ROLLBACK')
      } catch {
        // ignore rollback errors
      }
      throw error
    } finally {
      inWriteTransaction = false
    }
  } finally {
    release()
  }
}

function dbRun(sql, params = []) {
  db.run(sql, params)
}

function dbGet(sql, params = []) {
  refreshDatabaseIfNeeded()

  const stmt = db.prepare(sql)
  stmt.bind(params)

  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }

  stmt.free()
  return null
}

function dbAll(sql, params = []) {
  refreshDatabaseIfNeeded()

  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []

  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }

  stmt.free()
  return rows
}

function dbInsert(sql, params = []) {
  db.run(sql, params)
  return db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0]
}

function sanitizeSegment(value, fallback = 'document') {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)

  return cleaned || fallback
}

function ensureUniqueFilePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath

  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)

  let index = 2
  while (true) {
    const candidate = path.join(dir, `${base}__${index}${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}

function archiveDocument(sourcePath, meta = {}) {
  if (!sourcePath) return null

  const absoluteSource = path.resolve(sourcePath)
  if (!fs.existsSync(absoluteSource)) {
    throw new Error('Le fichier selectionne est introuvable.')
  }

  const typeSegment = sanitizeSegment(meta.type || 'document')
  const dateSegment = String(meta.date || new Date().toISOString().slice(0, 10))
  const year = /^\d{4}$/.test(dateSegment.slice(0, 4)) ? dateSegment.slice(0, 4) : 'sans-date'
  const month = /^\d{2}$/.test(dateSegment.slice(5, 7)) ? dateSegment.slice(5, 7) : '00'
  const extension = (path.extname(absoluteSource) || '.pdf').toLowerCase()
  const archiveDir = ensureDirectory(path.join(getActiveDocumentsRoot(), typeSegment, year, month))
  const filename = [
    sanitizeSegment(meta.date || 'document'),
    sanitizeSegment(meta.reference || typeSegment, typeSegment),
    sanitizeSegment(meta.fournisseurNom || 'cabinet', 'cabinet'),
  ].join('__') + extension

  let targetPath = path.join(archiveDir, filename)

  if (path.resolve(absoluteSource).toLowerCase() === path.resolve(targetPath).toLowerCase()) {
    return targetPath
  }

  targetPath = ensureUniqueFilePath(targetPath)
  fs.copyFileSync(absoluteSource, targetPath)
  return targetPath
}

function exportDocumentToDirectory(sourcePath, targetDirectory) {
  const absoluteSource = path.resolve(sourcePath)
  if (!fs.existsSync(absoluteSource)) {
    throw new Error('Le fichier a exporter est introuvable.')
  }

  ensureDirectory(targetDirectory)
  const targetPath = ensureUniqueFilePath(path.join(targetDirectory, path.basename(absoluteSource)))
  fs.copyFileSync(absoluteSource, targetPath)
  return targetPath
}

function getMimeTypeForFile(filePath) {
  const lower = String(filePath || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'application/octet-stream'
}

function getFournisseurNomById(fournisseurId) {
  if (!fournisseurId) return null
  const fournisseur = dbGet('SELECT nom FROM fournisseurs WHERE id = ?', [fournisseurId])
  return fournisseur ? fournisseur.nom : null
}

function normalizeCommandeStatus(value) {
  const allowed = ['EN_ATTENTE', 'PARTIELLE', 'RECUE', 'ANNULEE']
  return allowed.includes(value) ? value : 'EN_ATTENTE'
}

function tableHasColumn(tableName, columnName) {
  // Whitelist de noms de tables valides pour éviter l'injection SQL
  const validTables = [
    'fournisseurs', 'produits', 'praticiens', 'receptions', 'reception_items',
    'reception_passages', 'commandes', 'commande_items', 'utilisations',
    'utilisation_items', 'documents', 'soins_templates', 'categories', 'config',
  ]
  if (!validTables.includes(tableName)) return false

  const result = db.exec(`PRAGMA table_info(${tableName})`)
  if (!result.length) return false

  const nameIndex = result[0].columns.indexOf('name')
  return result[0].values.some(row => row[nameIndex] === columnName)
}

function ensureColumn(tableName, columnName, sqlDefinition) {
  if (!tableHasColumn(tableName, columnName)) {
    db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`)
  }
}

function syncCategoriesCatalog() {
  const categoriesInProducts = db.exec(`SELECT DISTINCT categorie FROM produits WHERE categorie IS NOT NULL AND TRIM(categorie) <> ''`)
  if (!categoriesInProducts.length) return

  categoriesInProducts[0].values.forEach(([nom]) => {
    db.run('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [nom])
  })
}

function computeCommandeStatus(commandeId) {
  const orderedItems = dbAll('SELECT produit_id, quantite FROM commande_items WHERE commande_id = ?', [commandeId])
  const receivedItems = dbAll(`SELECT ri.produit_id, SUM(ri.quantite) AS quantite
    FROM reception_items ri
    JOIN receptions r ON r.id = ri.reception_id
    WHERE r.commande_id = ?
    GROUP BY ri.produit_id`, [commandeId])

  const receivedByProduct = new Map(receivedItems.map(item => [item.produit_id, Number(item.quantite || 0)]))
  const anyReceived = receivedItems.some(item => Number(item.quantite || 0) > 0)

  if (!anyReceived) return 'EN_ATTENTE'

  const allReceived = orderedItems.every(item => {
    const orderedQty = Number(item.quantite || 0)
    const receivedQty = Number(receivedByProduct.get(item.produit_id) || 0)
    return receivedQty >= orderedQty
  })

  return allReceived ? 'RECUE' : 'PARTIELLE'
}

function countLinkedReceptionsForCommande(commandeId) {
  if (!commandeId) return 0
  const row = dbGet('SELECT COUNT(*) AS c FROM receptions WHERE commande_id = ?', [commandeId])
  return Number(row?.c || 0)
}

function syncCommandeStatus(commandeId, fallbackStatus = null) {
  if (!commandeId) return

  const current = dbGet('SELECT statut FROM commandes WHERE id = ?', [commandeId])
  if (!current) return

  const nextStatus = countLinkedReceptionsForCommande(commandeId) > 0
    ? computeCommandeStatus(commandeId)
    : normalizeCommandeStatus(fallbackStatus || current.statut)

  dbRun('UPDATE commandes SET statut = ? WHERE id = ?', [nextStatus, commandeId])
}

function buildQuantityMap(items = []) {
  const quantities = new Map()

  items.forEach(item => {
    const produitId = Number(item.produit_id || 0)
    if (!produitId) return

    const currentQty = Number(quantities.get(produitId) || 0)
    quantities.set(produitId, currentQty + Number(item.quantite || 0))
  })

  return quantities
}

function insertReceptionPassage(receptionId, data = {}) {
  if (!receptionId) return

  dbRun(`INSERT INTO reception_passages (
    reception_id, date, reference_bl, reference_facture, notes, document_path
  ) VALUES (?, ?, ?, ?, ?, ?)`, [
    receptionId,
    data.date || new Date().toISOString().slice(0, 10),
    data.reference_bl || null,
    data.reference_facture || null,
    data.notes || null,
    data.document_path || null,
  ])
}

function backfillReceptionPassages() {
  const receptionsWithoutHistory = dbAll(`SELECT r.*
    FROM receptions r
    WHERE NOT EXISTS (
      SELECT 1
      FROM reception_passages rp
      WHERE rp.reception_id = r.id
    )`)

  receptionsWithoutHistory.forEach(reception => {
    insertReceptionPassage(reception.id, reception)
  })
}

function mergeCommandeReceptions(commandeId) {
  if (!commandeId) return null

  const receptions = dbAll(`SELECT *
    FROM receptions
    WHERE commande_id = ?
    ORDER BY date ASC, created_at ASC, id ASC`, [commandeId])

  if (!receptions.length) return null

  const [primary, ...duplicates] = receptions
  if (!duplicates.length) return primary.id

  let nextDate = primary.date || null
  let nextFournisseurId = primary.fournisseur_id || null
  let nextReferenceBl = primary.reference_bl || null
  let nextReferenceFacture = primary.reference_facture || null
  let nextNotes = primary.notes || null
  let nextDocumentPath = primary.document_path || null

  duplicates.forEach(reception => {
    if (reception.date && (!nextDate || reception.date > nextDate)) nextDate = reception.date
    if (!nextFournisseurId && reception.fournisseur_id) nextFournisseurId = reception.fournisseur_id
    if (!nextReferenceBl && reception.reference_bl) nextReferenceBl = reception.reference_bl
    if (!nextReferenceFacture && reception.reference_facture) nextReferenceFacture = reception.reference_facture
    if (!nextNotes && reception.notes) nextNotes = reception.notes
    if (!nextDocumentPath && reception.document_path) nextDocumentPath = reception.document_path

    dbRun('UPDATE reception_items SET reception_id = ? WHERE reception_id = ?', [primary.id, reception.id])
    dbRun('UPDATE documents SET reception_id = ? WHERE reception_id = ?', [primary.id, reception.id])
    dbRun('UPDATE reception_passages SET reception_id = ? WHERE reception_id = ?', [primary.id, reception.id])
    dbRun('DELETE FROM receptions WHERE id = ?', [reception.id])
  })

  dbRun(`UPDATE receptions
    SET date = ?, fournisseur_id = ?, reference_bl = ?, reference_facture = ?, notes = ?, document_path = ?
    WHERE id = ?`, [
    nextDate,
    nextFournisseurId,
    nextReferenceBl,
    nextReferenceFacture,
    nextNotes,
    nextDocumentPath,
    primary.id,
  ])

  return primary.id
}

function mergeDuplicateCommandeReceptions() {
  const commandes = dbAll(`SELECT commande_id
    FROM receptions
    WHERE commande_id IS NOT NULL
    GROUP BY commande_id
    HAVING COUNT(*) > 1`)

  commandes.forEach(row => {
    mergeCommandeReceptions(Number(row.commande_id || 0))
  })
}

function appendToReception(receptionId, data) {
  const current = dbGet('SELECT * FROM receptions WHERE id = ?', [receptionId])
  if (!current) {
    throw new Error('Reception introuvable.')
  }

  const fournisseurId = data.fournisseur_id || current.fournisseur_id || null
  const fournisseurNom = getFournisseurNomById(fournisseurId)
  const archivedDocumentPath = data.document_path
    ? archiveDocument(data.document_path, {
      type: 'BL',
      date: data.date,
      reference: data.reference_bl,
      fournisseurNom,
    })
    : null

  dbRun(`UPDATE receptions
    SET date = ?, fournisseur_id = ?, commande_id = ?, reference_bl = ?, reference_facture = ?, notes = ?, document_path = ?
    WHERE id = ?`, [
    data.date || current.date,
    fournisseurId,
    data.commande_id || current.commande_id || null,
    data.reference_bl || current.reference_bl || null,
    data.reference_facture || current.reference_facture || null,
    data.notes || current.notes || null,
    archivedDocumentPath || current.document_path || null,
    receptionId,
  ])

  let montantTotal = 0

  for (const item of data.items || []) {
    const quantite = Number(item.quantite || 0)
    const prixUnitaire = Number(item.prix_unitaire || 0)

    dbRun(`INSERT INTO reception_items (
      reception_id, produit_id, quantite, prix_unitaire, lot, date_expiration
    ) VALUES (?, ?, ?, ?, ?, ?)`, [
      receptionId,
      item.produit_id,
      quantite,
      prixUnitaire,
      item.lot || null,
      item.date_expiration || null,
    ])

    dbRun('UPDATE produits SET stock_actuel = stock_actuel + ? WHERE id = ?', [
      quantite,
      item.produit_id,
    ])

    montantTotal += quantite * prixUnitaire
  }

  if (data.reference_bl || archivedDocumentPath) {
    dbInsert(`INSERT INTO documents (
      type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      'BL',
      data.date,
      data.reference_bl || null,
      fournisseurId,
      receptionId,
      archivedDocumentPath,
      null,
      'Passage supplementaire archive depuis la reception fournisseur.',
    ])
  }

  if (data.reference_facture) {
    dbInsert(`INSERT INTO documents (
      type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      'FACTURE',
      data.date,
      data.reference_facture,
      fournisseurId,
      receptionId,
      null,
      montantTotal || null,
      'Facture ajoutee lors d une reception partielle.',
    ])
  }

  insertReceptionPassage(receptionId, {
    date: data.date,
    reference_bl: data.reference_bl,
    reference_facture: data.reference_facture,
    notes: data.notes,
    document_path: archivedDocumentPath,
  })

  if (data.commande_id || current.commande_id) {
    syncCommandeStatus(data.commande_id || current.commande_id)
  }

  return receptionId
}

function ensureSchema() {
  db.run(`CREATE TABLE IF NOT EXISTS fournisseurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    email TEXT,
    telephone TEXT,
    adresse TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT,
    nom TEXT NOT NULL,
    categorie TEXT,
    unite TEXT DEFAULT 'unite',
    stock_actuel REAL DEFAULT 0,
    stock_minimum REAL DEFAULT 0,
    prix_unitaire REAL DEFAULT 0,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS praticiens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT,
    role TEXT DEFAULT 'praticien'
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS receptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    reference_bl TEXT,
    reference_facture TEXT,
    statut TEXT DEFAULT 'recu',
    notes TEXT,
    document_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS reception_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reception_id INTEGER REFERENCES receptions(id),
    produit_id INTEGER REFERENCES produits(id),
    quantite REAL NOT NULL,
    prix_unitaire REAL,
    lot TEXT,
    date_expiration DATE
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS reception_passages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reception_id INTEGER REFERENCES receptions(id),
    date DATE NOT NULL,
    reference_bl TEXT,
    reference_facture TEXT,
    notes TEXT,
    document_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date_commande DATE NOT NULL,
    date_prevue DATE,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    reference_commande TEXT,
    statut TEXT DEFAULT 'EN_ATTENTE',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS commande_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commande_id INTEGER REFERENCES commandes(id),
    produit_id INTEGER REFERENCES produits(id),
    quantite REAL NOT NULL,
    prix_unitaire REAL DEFAULT 0
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS utilisations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    praticien_id INTEGER REFERENCES praticiens(id),
    type_soin TEXT,
    patient_ref TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS utilisation_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    utilisation_id INTEGER REFERENCES utilisations(id),
    produit_id INTEGER REFERENCES produits(id),
    quantite REAL NOT NULL
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    date DATE NOT NULL,
    reference TEXT,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    reception_id INTEGER REFERENCES receptions(id),
    chemin_fichier TEXT,
    montant REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS soins_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_soin TEXT NOT NULL,
    produit_id INTEGER REFERENCES produits(id),
    quantite_defaut REAL DEFAULT 1
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS config (
    cle TEXT PRIMARY KEY,
    valeur TEXT
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  ensureColumn('fournisseurs', 'contact_commercial', 'TEXT')
  ensureColumn('receptions', 'commande_id', 'INTEGER')

  // Index sur les clés étrangères pour accélérer les jointures
  db.run('CREATE INDEX IF NOT EXISTS idx_produits_fournisseur ON produits(fournisseur_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie)')
  db.run('CREATE INDEX IF NOT EXISTS idx_produits_reference ON produits(reference)')
  db.run('CREATE INDEX IF NOT EXISTS idx_receptions_fournisseur ON receptions(fournisseur_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_receptions_commande ON receptions(commande_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_receptions_date ON receptions(date)')
  db.run('CREATE INDEX IF NOT EXISTS idx_reception_items_reception ON reception_items(reception_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_reception_items_produit ON reception_items(produit_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_reception_passages_reception ON reception_passages(reception_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_commande_items_commande ON commande_items(commande_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_commande_items_produit ON commande_items(produit_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_utilisations_praticien ON utilisations(praticien_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_utilisation_items_utilisation ON utilisation_items(utilisation_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_utilisation_items_produit ON utilisation_items(produit_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_documents_fournisseur ON documents(fournisseur_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_documents_reception ON documents(reception_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date)')

  syncCategoriesCatalog()
}

async function initDatabase(targetPath) {
  dbPath = targetPath

  if (!SQL) {
    const initSqlJs = require('sql.js')
    // En production, le fichier WASM est dans les extraResources
    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : undefined
    SQL = await initSqlJs(wasmPath ? { locateFile: () => wasmPath } : undefined)
  }

  loadDatabaseFromFile(targetPath)
  ensureSchema()
  backfillReceptionPassages()
  mergeDuplicateCommandeReceptions()

  saveDatabase()
}

function resolveInitialDbPath() {
  const configuredDbPath = readTextFile(dbConfigFile)
  if (configuredDbPath) return configuredDbPath

  const storageRoot = getConfiguredStorageRoot()
  if (storageRoot) {
    return path.join(storageRoot, 'database', DB_FILENAME)
  }

  return getDefaultDbPath()
}

function switchDatabasePath(nextDbPath) {
  const resolvedPath = path.resolve(nextDbPath)
  const currentExport = db ? Buffer.from(db.export()) : null

  ensureDirectory(path.dirname(resolvedPath))

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0) {
    dbPath = resolvedPath
    loadDatabaseFromFile(resolvedPath)
    ensureSchema()
    backfillReceptionPassages()
    mergeDuplicateCommandeReceptions()
    saveDatabase()
    return 'existing'
  }

  if (currentExport) {
    fs.writeFileSync(resolvedPath, currentExport)
  }

  dbPath = resolvedPath
  loadDatabaseFromFile(resolvedPath)
  ensureSchema()
  backfillReceptionPassages()
  mergeDuplicateCommandeReceptions()
  saveDatabase()

  return 'copied'
}

// Wrapper IPC sécurisé : capture les erreurs et les remonte proprement au renderer
function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      console.error(`[IPC:${channel}] Erreur:`, error.message)
      throw error
    }
  })
}

// Config
safeHandle('config:get', (_, cle) => {
  const row = dbGet('SELECT valeur FROM config WHERE cle = ?', [cle])
  return row ? row.valeur : null
})

safeHandle('config:set', async (_, cle, valeur) => {
  await withWriteTransaction(() => {
    dbRun('INSERT OR REPLACE INTO config (cle, valeur) VALUES (?, ?)', [cle, valeur])
  })
})

// Storage
safeHandle('storage:getStatus', () => getStorageStatus())

safeHandle('storage:setRoot', async (_, rootPath) => {
  if (!rootPath) throw new Error('Veuillez selectionner un dossier de stockage.')

  const storageRoot = path.resolve(rootPath)
  ensureDirectory(storageRoot)
  ensureDirectory(path.join(storageRoot, 'database'))
  ensureDirectory(path.join(storageRoot, 'documents'))

  const databaseState = switchDatabasePath(path.join(storageRoot, 'database', DB_FILENAME))

  writeTextFile(dbConfigFile, dbPath)
  writeTextFile(storageConfigFile, storageRoot)

  return getStorageStatus({ databaseState })
})

// Fournisseurs
safeHandle('fournisseurs:list', () => dbAll('SELECT * FROM fournisseurs ORDER BY nom'))

safeHandle('fournisseurs:add', async (_, data) => {
  return withWriteTransaction(() => {
    return dbInsert(
      'INSERT INTO fournisseurs (nom, email, telephone, adresse, contact_commercial) VALUES (?, ?, ?, ?, ?)',
      [data.nom, data.email, data.telephone, data.adresse, data.contact_commercial]
    )
  })
})

safeHandle('fournisseurs:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    dbRun(`UPDATE fournisseurs
      SET nom = ?, email = ?, telephone = ?, adresse = ?, contact_commercial = ?
      WHERE id = ?`, [
      data.nom,
      data.email,
      data.telephone,
      data.adresse,
      data.contact_commercial,
      id,
    ])
  })
})

// Categories
safeHandle('categories:list', () => {
  return dbAll(`SELECT c.*,
    (SELECT COUNT(*) FROM produits p WHERE p.categorie = c.nom) AS nb_produits
    FROM categories c
    ORDER BY c.nom`)
})

safeHandle('categories:add', async (_, data) => {
  return withWriteTransaction(() => {
    return dbInsert('INSERT INTO categories (nom, description) VALUES (?, ?)', [
      data.nom,
      data.description || null,
    ])
  })
})

safeHandle('categories:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM categories WHERE id = ?', [id])
    if (!current) {
      throw new Error('Categorie introuvable.')
    }

    dbRun('UPDATE categories SET nom = ?, description = ? WHERE id = ?', [
      data.nom,
      data.description || null,
      id,
    ])

    if (current.nom !== data.nom) {
      dbRun('UPDATE produits SET categorie = ? WHERE categorie = ?', [data.nom, current.nom])
    }
  })
})

safeHandle('categories:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM categories WHERE id = ?', [id])
    if (!current) {
      throw new Error('Categorie introuvable.')
    }

    dbRun('UPDATE produits SET categorie = NULL WHERE categorie = ?', [current.nom])
    dbRun('DELETE FROM categories WHERE id = ?', [id])
  })
})

// Produits
safeHandle('produits:list', () => {
  return dbAll(`SELECT p.*, f.nom AS fournisseur_nom
    FROM produits p
    LEFT JOIN fournisseurs f ON p.fournisseur_id = f.id
    ORDER BY p.nom`)
})

safeHandle('produits:add', async (_, data) => {
  return withWriteTransaction(() => {
    if (data.categorie) {
      dbRun('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [data.categorie])
    }

    return dbInsert(`INSERT INTO produits (
      reference, nom, categorie, unite, stock_actuel, stock_minimum, prix_unitaire, fournisseur_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      data.reference,
      data.nom,
      data.categorie,
      data.unite,
      data.stock_actuel || 0,
      data.stock_minimum || 0,
      data.prix_unitaire || 0,
      data.fournisseur_id || null,
    ])
  })
})

safeHandle('produits:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    if (data.categorie) {
      dbRun('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [data.categorie])
    }

    dbRun(`UPDATE produits
      SET reference = ?, nom = ?, categorie = ?, unite = ?, stock_actuel = ?, stock_minimum = ?, prix_unitaire = ?, fournisseur_id = ?
      WHERE id = ?`, [
      data.reference,
      data.nom,
      data.categorie,
      data.unite,
      data.stock_actuel,
      data.stock_minimum,
      data.prix_unitaire,
      data.fournisseur_id,
      id,
    ])
  })
})

safeHandle('produits:history', (_, id) => {
  const commandes = dbAll(`SELECT
      c.id AS commande_id,
      c.date_commande,
      c.date_prevue,
      c.reference_commande,
      c.statut,
      f.nom AS fournisseur_nom,
      ci.quantite,
      ci.prix_unitaire,
      (ci.quantite * ci.prix_unitaire) AS montant_total
    FROM commande_items ci
    JOIN commandes c ON c.id = ci.commande_id
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    WHERE ci.produit_id = ?
    ORDER BY c.date_commande DESC, c.created_at DESC
    LIMIT 20`, [id])

  const receptions = dbAll(`SELECT
      r.id AS reception_id,
      r.date,
      r.reference_bl,
      r.reference_facture,
      f.nom AS fournisseur_nom,
      ri.quantite,
      ri.prix_unitaire,
      ri.lot,
      ri.date_expiration,
      (ri.quantite * ri.prix_unitaire) AS montant_total
    FROM reception_items ri
    JOIN receptions r ON r.id = ri.reception_id
    LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
    WHERE ri.produit_id = ?
    ORDER BY r.date DESC, ri.id DESC
    LIMIT 20`, [id])

  return {
    commandes,
    receptions,
  }
})

// Commandes
safeHandle('commandes:list', () => {
  return dbAll(`SELECT c.*, f.nom AS fournisseur_nom,
    (SELECT COUNT(*) FROM commande_items WHERE commande_id = c.id) AS nb_produits,
    (SELECT SUM(ci.quantite * ci.prix_unitaire) FROM commande_items ci WHERE ci.commande_id = c.id) AS montant_total,
    (SELECT MIN(r.id) FROM receptions r WHERE r.commande_id = c.id) AS active_reception_id,
    (SELECT COUNT(*)
      FROM reception_passages rp
      WHERE rp.reception_id = (SELECT MIN(r2.id) FROM receptions r2 WHERE r2.commande_id = c.id)
    ) AS nb_passages,
    (SELECT MAX(rp.date)
      FROM reception_passages rp
      WHERE rp.reception_id = (SELECT MIN(r2.id) FROM receptions r2 WHERE r2.commande_id = c.id)
    ) AS derniere_reception_date
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    ORDER BY
      CASE c.statut
        WHEN 'EN_ATTENTE' THEN 1
        WHEN 'PARTIELLE' THEN 2
        WHEN 'RECUE' THEN 3
        WHEN 'ANNULEE' THEN 4
        ELSE 5
      END,
      c.date_commande DESC,
      c.created_at DESC`)
})

safeHandle('commandes:get', (_, id) => {
  const commande = dbGet(`SELECT c.*, f.nom AS fournisseur_nom,
    (SELECT MIN(r.id) FROM receptions r WHERE r.commande_id = c.id) AS active_reception_id,
    (SELECT COUNT(*)
      FROM reception_passages rp
      WHERE rp.reception_id = (SELECT MIN(r2.id) FROM receptions r2 WHERE r2.commande_id = c.id)
    ) AS nb_passages,
    (SELECT MAX(rp.date)
      FROM reception_passages rp
      WHERE rp.reception_id = (SELECT MIN(r2.id) FROM receptions r2 WHERE r2.commande_id = c.id)
    ) AS derniere_reception_date
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    WHERE c.id = ?`, [id])

  if (!commande) return null

  commande.items = dbAll(`SELECT ci.*, p.nom AS produit_nom, p.reference, p.unite,
    COALESCE((
      SELECT SUM(ri.quantite)
      FROM reception_items ri
      JOIN receptions r ON r.id = ri.reception_id
      WHERE r.commande_id = ? AND ri.produit_id = ci.produit_id
    ), 0) AS quantite_recue,
    CASE
      WHEN ci.quantite - COALESCE((
        SELECT SUM(ri.quantite)
        FROM reception_items ri
        JOIN receptions r ON r.id = ri.reception_id
        WHERE r.commande_id = ? AND ri.produit_id = ci.produit_id
      ), 0) > 0
      THEN ci.quantite - COALESCE((
        SELECT SUM(ri.quantite)
        FROM reception_items ri
        JOIN receptions r ON r.id = ri.reception_id
        WHERE r.commande_id = ? AND ri.produit_id = ci.produit_id
      ), 0)
      ELSE 0
    END AS quantite_restante
    FROM commande_items ci
    LEFT JOIN produits p ON ci.produit_id = p.id
    WHERE ci.commande_id = ?
    ORDER BY p.nom`, [id, id, id, id])

  return commande
})

safeHandle('commandes:add', async (_, data) => {
  return withWriteTransaction(() => {
    const commandeId = dbInsert(`INSERT INTO commandes (
      date_commande, date_prevue, fournisseur_id, reference_commande, statut, notes
    ) VALUES (?, ?, ?, ?, ?, ?)`, [
      data.date_commande,
      data.date_prevue || null,
      data.fournisseur_id || null,
      data.reference_commande || null,
      normalizeCommandeStatus(data.statut),
      data.notes || null,
    ])

    for (const item of data.items || []) {
      dbRun(`INSERT INTO commande_items (
        commande_id, produit_id, quantite, prix_unitaire
      ) VALUES (?, ?, ?, ?)`, [
        commandeId,
        item.produit_id,
        Number(item.quantite || 0),
        Number(item.prix_unitaire || 0),
      ])
    }

    return commandeId
  })
})

safeHandle('commandes:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM commandes WHERE id = ?', [id])
    if (!current) {
      throw new Error('Commande introuvable.')
    }

    const requestedStatus = normalizeCommandeStatus(data.statut)

    dbRun(`UPDATE commandes
      SET date_commande = ?, date_prevue = ?, fournisseur_id = ?, reference_commande = ?, statut = ?, notes = ?
      WHERE id = ?`, [
      data.date_commande,
      data.date_prevue || null,
      data.fournisseur_id || null,
      data.reference_commande || null,
      requestedStatus,
      data.notes || null,
      id,
    ])

    dbRun('DELETE FROM commande_items WHERE commande_id = ?', [id])

    for (const item of data.items || []) {
      dbRun(`INSERT INTO commande_items (
        commande_id, produit_id, quantite, prix_unitaire
      ) VALUES (?, ?, ?, ?)`, [
        id,
        item.produit_id,
        Number(item.quantite || 0),
        Number(item.prix_unitaire || 0),
      ])
    }

    if (requestedStatus === 'ANNULEE') {
      dbRun('UPDATE commandes SET statut = ? WHERE id = ?', [requestedStatus, id])
    } else {
      syncCommandeStatus(id, requestedStatus)
    }
  })
})

safeHandle('commandes:updateStatus', async (_, id, statut) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE commandes SET statut = ? WHERE id = ?', [normalizeCommandeStatus(statut), id])
  })
})

// Praticiens
safeHandle('praticiens:list', () => dbAll('SELECT * FROM praticiens ORDER BY nom'))

safeHandle('praticiens:add', async (_, data) => {
  return withWriteTransaction(() => {
    return dbInsert('INSERT INTO praticiens (nom, prenom, role) VALUES (?, ?, ?)', [
      data.nom,
      data.prenom,
      data.role,
    ])
  })
})

safeHandle('praticiens:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE praticiens SET nom = ?, prenom = ?, role = ? WHERE id = ?', [
      data.nom, data.prenom, data.role, id,
    ])
  })
})

safeHandle('praticiens:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const linked = dbGet('SELECT COUNT(*) AS c FROM utilisations WHERE praticien_id = ?', [id])
    if (linked && linked.c > 0) {
      throw new Error('Ce praticien est lie a des consommations existantes et ne peut pas etre supprime.')
    }
    dbRun('DELETE FROM praticiens WHERE id = ?', [id])
  })
})

// Receptions
safeHandle('receptions:list', () => {
  return dbAll(`SELECT r.*, f.nom AS fournisseur_nom,
    (SELECT COUNT(*) FROM reception_items WHERE reception_id = r.id) AS nb_produits,
    (SELECT SUM(ri.quantite * ri.prix_unitaire) FROM reception_items ri WHERE ri.reception_id = r.id) AS montant_total,
    (SELECT COUNT(*) FROM reception_passages rp WHERE rp.reception_id = r.id) AS nb_passages,
    (SELECT MIN(rp.date) FROM reception_passages rp WHERE rp.reception_id = r.id) AS premiere_date,
    (SELECT MAX(rp.date) FROM reception_passages rp WHERE rp.reception_id = r.id) AS derniere_date
    FROM receptions r
    LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
    ORDER BY r.date DESC, r.created_at DESC`)
})

safeHandle('receptions:get', (_, id) => {
  const reception = dbGet(`SELECT r.*, f.nom AS fournisseur_nom
    FROM receptions r
    LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
    WHERE r.id = ?`, [id])

  if (!reception) return null

  reception.items = dbAll(`SELECT ri.*, p.nom AS produit_nom, p.unite, p.reference
    FROM reception_items ri
    LEFT JOIN produits p ON ri.produit_id = p.id
    WHERE ri.reception_id = ?
    ORDER BY ri.id`, [id])

  reception.passages = dbAll(`SELECT *
    FROM reception_passages
    WHERE reception_id = ?
    ORDER BY date ASC, created_at ASC, id ASC`, [id])
  reception.nb_passages = reception.passages.length

  return reception
})

safeHandle('receptions:add', async (_, data) => {
  return withWriteTransaction(() => {
    const existingReceptionId = data.commande_id
      ? mergeCommandeReceptions(Number(data.commande_id))
      : null

    if (existingReceptionId) {
      return appendToReception(existingReceptionId, data)
    }

    const fournisseurNom = getFournisseurNomById(data.fournisseur_id)
    const archivedDocumentPath = data.document_path
      ? archiveDocument(data.document_path, {
        type: 'BL',
        date: data.date,
        reference: data.reference_bl,
        fournisseurNom,
      })
      : null

    const receptionId = dbInsert(`INSERT INTO receptions (
      date, fournisseur_id, commande_id, reference_bl, reference_facture, notes, document_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      data.date,
      data.fournisseur_id,
      data.commande_id || null,
      data.reference_bl,
      data.reference_facture,
      data.notes,
      archivedDocumentPath,
    ])

    let montantTotal = 0

    for (const item of data.items) {
      const quantite = Number(item.quantite || 0)
      const prixUnitaire = Number(item.prix_unitaire || 0)

      dbRun(`INSERT INTO reception_items (
        reception_id, produit_id, quantite, prix_unitaire, lot, date_expiration
      ) VALUES (?, ?, ?, ?, ?, ?)`, [
        receptionId,
        item.produit_id,
        quantite,
        prixUnitaire,
        item.lot || null,
        item.date_expiration || null,
      ])

      dbRun('UPDATE produits SET stock_actuel = stock_actuel + ? WHERE id = ?', [
        quantite,
        item.produit_id,
      ])

      montantTotal += quantite * prixUnitaire
    }

    if (data.reference_bl || archivedDocumentPath) {
      dbInsert(`INSERT INTO documents (
        type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        'BL',
        data.date,
        data.reference_bl || null,
        data.fournisseur_id || null,
        receptionId,
        archivedDocumentPath,
        null,
        'Archive automatiquement depuis la reception fournisseur.',
      ])
    }

    if (data.reference_facture) {
      dbInsert(`INSERT INTO documents (
        type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        'FACTURE',
        data.date,
        data.reference_facture,
        data.fournisseur_id || null,
        receptionId,
        null,
        montantTotal || null,
        'Reference facture renseignee lors de la reception.',
      ])
    }

    if (data.commande_id) {
      syncCommandeStatus(data.commande_id)
    }

    insertReceptionPassage(receptionId, {
      date: data.date,
      reference_bl: data.reference_bl,
      reference_facture: data.reference_facture,
      notes: data.notes,
      document_path: archivedDocumentPath,
    })

    return receptionId
  })
})

safeHandle('receptions:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const normalizedReceptionId = mergeCommandeReceptions(Number(data.commande_id || 0)) || id
    if (normalizedReceptionId !== id) {
      id = normalizedReceptionId
    }

    const current = dbGet('SELECT * FROM receptions WHERE id = ?', [id])
    if (!current) {
      throw new Error('Reception introuvable.')
    }

    const oldItems = dbAll('SELECT * FROM reception_items WHERE reception_id = ?', [id])
    const oldQuantities = buildQuantityMap(oldItems)
    const newQuantities = buildQuantityMap(data.items || [])
    const impactedProducts = new Set([...oldQuantities.keys(), ...newQuantities.keys()])
    const passageCount = Number(dbGet('SELECT COUNT(*) AS c FROM reception_passages WHERE reception_id = ?', [id])?.c || 0)

    impactedProducts.forEach(produitId => {
      const oldQty = Number(oldQuantities.get(produitId) || 0)
      const newQty = Number(newQuantities.get(produitId) || 0)
      const delta = newQty - oldQty
      if (delta === 0) return

      const produit = dbGet('SELECT nom, stock_actuel FROM produits WHERE id = ?', [produitId])
      if (!produit) {
        throw new Error('Produit introuvable dans cette reception.')
      }

      const nextStock = Number(produit.stock_actuel || 0) + delta
      if (nextStock < 0) {
        throw new Error(`Impossible de reduire la reception du produit "${produit.nom}" car une partie du stock a deja ete utilisee.`)
      }
    })

    const fournisseurNom = getFournisseurNomById(data.fournisseur_id)
    const archivedDocumentPath = data.document_path
      ? archiveDocument(data.document_path, {
        type: 'BL',
        date: data.date,
        reference: data.reference_bl,
        fournisseurNom,
      })
      : null

    dbRun(`UPDATE receptions
      SET date = ?, fournisseur_id = ?, commande_id = ?, reference_bl = ?, reference_facture = ?, notes = ?, document_path = ?
      WHERE id = ?`, [
      data.date,
      data.fournisseur_id || null,
      data.commande_id || null,
      data.reference_bl || null,
      data.reference_facture || null,
      data.notes || null,
      archivedDocumentPath,
      id,
    ])

    dbRun('DELETE FROM reception_items WHERE reception_id = ?', [id])

    let montantTotal = 0

    for (const item of data.items || []) {
      const quantite = Number(item.quantite || 0)
      const prixUnitaire = Number(item.prix_unitaire || 0)

      dbRun(`INSERT INTO reception_items (
        reception_id, produit_id, quantite, prix_unitaire, lot, date_expiration
      ) VALUES (?, ?, ?, ?, ?, ?)`, [
        id,
        item.produit_id,
        quantite,
        prixUnitaire,
        item.lot || null,
        item.date_expiration || null,
      ])

      montantTotal += quantite * prixUnitaire
    }

    impactedProducts.forEach(produitId => {
      const oldQty = Number(oldQuantities.get(produitId) || 0)
      const newQty = Number(newQuantities.get(produitId) || 0)
      const delta = newQty - oldQty

      if (delta !== 0) {
        dbRun('UPDATE produits SET stock_actuel = stock_actuel + ? WHERE id = ?', [delta, produitId])
      }
    })

    if (passageCount <= 1) {
      dbRun(`DELETE FROM documents
        WHERE reception_id = ?
        AND type IN ('BL', 'FACTURE')`, [id])

      if (data.reference_bl || archivedDocumentPath) {
        dbInsert(`INSERT INTO documents (
          type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
          'BL',
          data.date,
          data.reference_bl || null,
          data.fournisseur_id || null,
          id,
          archivedDocumentPath,
          null,
          'Archive automatiquement depuis la reception fournisseur.',
        ])
      }

      if (data.reference_facture) {
        dbInsert(`INSERT INTO documents (
          type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
          'FACTURE',
          data.date,
          data.reference_facture,
          data.fournisseur_id || null,
          id,
          null,
          montantTotal || null,
          'Reference facture renseignee lors de la reception.',
        ])
      }

      dbRun('DELETE FROM reception_passages WHERE reception_id = ?', [id])
      insertReceptionPassage(id, {
        date: data.date,
        reference_bl: data.reference_bl,
        reference_facture: data.reference_facture,
        notes: data.notes,
        document_path: archivedDocumentPath,
      })
    }

    const impactedCommandes = new Set(
      [Number(current.commande_id || 0), Number(data.commande_id || 0)].filter(Boolean)
    )

    impactedCommandes.forEach(commandeId => syncCommandeStatus(commandeId))
  })
})

// Utilisations
safeHandle('utilisations:list', () => {
  return dbAll(`SELECT u.*, p.nom AS praticien_nom, p.prenom AS praticien_prenom,
    (SELECT COUNT(*) FROM utilisation_items WHERE utilisation_id = u.id) AS nb_produits
    FROM utilisations u
    LEFT JOIN praticiens p ON u.praticien_id = p.id
    ORDER BY u.date DESC, u.created_at DESC`)
})

safeHandle('utilisations:get', (_, id) => {
  const utilisation = dbGet(`SELECT u.*, p.nom AS praticien_nom, p.prenom AS praticien_prenom
    FROM utilisations u
    LEFT JOIN praticiens p ON u.praticien_id = p.id
    WHERE u.id = ?`, [id])
  if (!utilisation) return null
  utilisation.items = dbAll(`SELECT ui.*, pr.nom AS produit_nom, pr.reference, pr.unite
    FROM utilisation_items ui
    LEFT JOIN produits pr ON ui.produit_id = pr.id
    WHERE ui.utilisation_id = ?
    ORDER BY pr.nom`, [id])
  return utilisation
})

safeHandle('utilisations:add', async (_, data) => {
  return withWriteTransaction(() => {
    const utilisationId = dbInsert(`INSERT INTO utilisations (
      date, praticien_id, type_soin, patient_ref, notes
    ) VALUES (?, ?, ?, ?, ?)`, [
      data.date,
      data.praticien_id || null,
      data.type_soin,
      data.patient_ref,
      data.notes,
    ])

    for (const item of data.items) {
      const quantite = Number(item.quantite || 0)

      dbRun(`INSERT INTO utilisation_items (utilisation_id, produit_id, quantite)
        VALUES (?, ?, ?)`, [utilisationId, item.produit_id, quantite])

      dbRun('UPDATE produits SET stock_actuel = MAX(0, stock_actuel - ?) WHERE id = ?', [
        quantite,
        item.produit_id,
      ])
    }

    return utilisationId
  })
})

// Soins templates
safeHandle('soins:templates', () => {
  return dbAll(`SELECT st.*, p.nom AS produit_nom
    FROM soins_templates st
    LEFT JOIN produits p ON st.produit_id = p.id
    ORDER BY st.type_soin, p.nom`)
})

safeHandle('soins:byType', (_, type) => {
  return dbAll(`SELECT st.*, p.nom AS produit_nom, p.unite
    FROM soins_templates st
    LEFT JOIN produits p ON st.produit_id = p.id
    WHERE st.type_soin = ?
    ORDER BY p.nom`, [type])
})

// Documents
safeHandle('documents:list', () => {
  return dbAll(`SELECT d.*, f.nom AS fournisseur_nom
    FROM documents d
    LEFT JOIN fournisseurs f ON d.fournisseur_id = f.id
    ORDER BY d.date DESC, d.created_at DESC`)
})

safeHandle('documents:add', async (_, data) => {
  return withWriteTransaction(() => {
    const fournisseurNom = getFournisseurNomById(data.fournisseur_id)
    const archivedPath = data.chemin_fichier
      ? archiveDocument(data.chemin_fichier, {
        type: data.type,
        date: data.date,
        reference: data.reference,
        fournisseurNom,
      })
      : null

    return dbInsert(`INSERT INTO documents (
      type, date, reference, fournisseur_id, reception_id, chemin_fichier, montant, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      data.type,
      data.date,
      data.reference,
      data.fournisseur_id,
      data.reception_id,
      archivedPath,
      data.montant,
      data.notes,
    ])
  })
})

safeHandle('documents:open', (_, cheminFichier) => {
  if (cheminFichier && fs.existsSync(cheminFichier)) {
    shell.openPath(cheminFichier)
  }
})

safeHandle('documents:export', async (_, cheminFichier) => {
  if (!cheminFichier || !fs.existsSync(cheminFichier)) {
    throw new Error('Le fichier a exporter est introuvable.')
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || !result.filePaths.length) {
    return null
  }

  return exportDocumentToDirectory(cheminFichier, result.filePaths[0])
})

safeHandle('documents:read', (_, cheminFichier) => {
  if (!cheminFichier || !fs.existsSync(cheminFichier)) {
    throw new Error('Le fichier a lire est introuvable.')
  }

  const absolutePath = path.resolve(cheminFichier)
  return {
    mimeType: getMimeTypeForFile(absolutePath),
    base64: fs.readFileSync(absolutePath).toString('base64'),
    fileName: path.basename(absolutePath),
  }
})

// Dashboard
safeHandle('stats:dashboard', () => {
  const totalProduits = dbGet('SELECT COUNT(*) AS c FROM produits').c
  const alertesStock = dbGet('SELECT COUNT(*) AS c FROM produits WHERE stock_actuel <= stock_minimum').c
  const commandesEnAttente = dbGet(`SELECT COUNT(*) AS c
    FROM commandes
    WHERE statut IN ('EN_ATTENTE', 'PARTIELLE')`).c
  const receptionsMois = dbGet(`SELECT COUNT(*) AS c
    FROM receptions
    WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`).c
  const montantRow = dbGet(`SELECT SUM(ri.quantite * ri.prix_unitaire) AS m
    FROM reception_items ri
    JOIN receptions r ON ri.reception_id = r.id
    WHERE strftime('%Y-%m', r.date) = strftime('%Y-%m', 'now')`)
  const montantMois = montantRow ? (montantRow.m || 0) : 0
  const produitsAlerte = dbAll(`SELECT *
    FROM produits
    WHERE stock_actuel <= stock_minimum
    ORDER BY (stock_actuel - stock_minimum)
    LIMIT 10`)
  const dernieresReceptions = dbAll(`SELECT r.*, f.nom AS fournisseur_nom
    FROM receptions r
    LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
    ORDER BY r.date DESC
    LIMIT 5`)
  const commandesEnCours = dbAll(`SELECT c.*, f.nom AS fournisseur_nom,
    (SELECT SUM(ci.quantite * ci.prix_unitaire) FROM commande_items ci WHERE ci.commande_id = c.id) AS montant_total
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    WHERE c.statut IN ('EN_ATTENTE', 'PARTIELLE')
    ORDER BY c.date_commande DESC
    LIMIT 5`)

  return {
    totalProduits,
    alertesStock,
    commandesEnAttente,
    receptionsMois,
    montantMois,
    produitsAlerte,
    dernieresReceptions,
    commandesEnCours,
  }
})

// Dialogs
safeHandle('dialog:openFile', async (_, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Documents', extensions: ['pdf', 'jpg', 'png', 'jpeg'] }],
  })

  return result.canceled ? null : result.filePaths[0]
})

safeHandle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })

  return result.canceled ? null : result.filePaths[0]
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }
}

app.whenReady().then(async () => {
  const userDataPath = getUserDataPath()
  dbConfigFile = path.join(userDataPath, 'dbpath.txt')
  storageConfigFile = path.join(userDataPath, 'storage-root.txt')

  try {
    await initDatabase(resolveInitialDbPath())
  } catch (error) {
    dialog.showErrorBox('Erreur base de donnees', `Impossible d'ouvrir la base de donnees : ${error.message}`)
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (db) {
    try {
      saveDatabase()
    } catch {
      // ignore save error on shutdown
    }
  }
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => (mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()))
ipcMain.on('window:close', () => mainWindow?.close())
