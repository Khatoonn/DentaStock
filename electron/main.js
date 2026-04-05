const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const zlib = require('zlib')
const dbHelpers = require('./db')
const statsHandlers = require('./handlers-stats')

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
const SETUP_CONFIG_FILENAME = 'dentastock-config.json'

let SQL = null
let db = null
let mainWindow = null
let dbPath = ''
let dbFileMtime = 0
let dbConfigFile = ''
let inWriteTransaction = false
let storageConfigFile = ''
let setupConfig = null

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

function getInstallDir() {
  // En production : dossier parent de l'exe (C:\DentaStock)
  // En dev : dossier du projet
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'))
  }
  return path.join(__dirname, '..')
}

function getSetupConfigPath() {
  return path.join(getInstallDir(), SETUP_CONFIG_FILENAME)
}

function loadSetupConfig() {
  const configPath = getSetupConfigPath()
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch { /* corrupt config, treat as unconfigured */ }
  }
  return null
}

function saveSetupConfig(config) {
  const configPath = getSetupConfigPath()
  ensureDirectory(path.dirname(configPath))
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  setupConfig = config
}

// --- Replication client ---
let replicaInterval = null

function getReplicaDir() {
  return path.join(getInstallDir(), 'data', 'replica')
}

function getReplicaDbPath() {
  return path.join(getReplicaDir(), DB_FILENAME)
}

function replicateFromServer() {
  if (!setupConfig || setupConfig.mode !== 'client' || !setupConfig.dataPath) return false

  const serverDb = path.join(setupConfig.dataPath, DB_FILENAME)
  try {
    if (!fs.existsSync(serverDb)) return false

    const replicaDir = ensureDirectory(getReplicaDir())
    const replicaPath = path.join(replicaDir, DB_FILENAME)
    fs.copyFileSync(serverDb, replicaPath)

    // Stocker la date de derniere synchro
    const metaPath = path.join(replicaDir, 'last-sync.txt')
    fs.writeFileSync(metaPath, new Date().toISOString(), 'utf-8')

    console.log('[DentaStock] Replica synchronisee depuis le serveur')
    return true
  } catch (err) {
    console.error('[DentaStock] Echec replica:', err.message)
    return false
  }
}

function startReplicaSync(intervalMs = 5 * 60 * 1000) {
  if (replicaInterval) clearInterval(replicaInterval)
  // Synchro initiale
  replicateFromServer()
  // Synchro periodique
  replicaInterval = setInterval(() => replicateFromServer(), intervalMs)
}

function isServerReachable() {
  if (!setupConfig || setupConfig.mode !== 'client' || !setupConfig.dataPath) return true
  try {
    return fs.existsSync(path.join(setupConfig.dataPath, DB_FILENAME))
  } catch {
    return false
  }
}

function getClientDbPath() {
  // Essayer le serveur, sinon fallback sur la replica locale
  const serverDb = path.join(setupConfig.dataPath, DB_FILENAME)
  try {
    if (fs.existsSync(serverDb)) return serverDb
  } catch { /* serveur inaccessible */ }

  const replicaPath = getReplicaDbPath()
  if (fs.existsSync(replicaPath)) {
    console.log('[DentaStock] Serveur inaccessible, utilisation de la replica locale')
    return replicaPath
  }
  throw new Error('Impossible de se connecter au serveur et aucune replica locale disponible.')
}

// --- Sauvegarde mensuelle automatique ---
function getBackupDir() {
  return path.join(getInstallDir(), 'data', 'backups')
}

function getLastMonthlyBackupDate() {
  const metaPath = path.join(getBackupDir(), 'last-monthly-backup.txt')
  if (!fs.existsSync(metaPath)) return null
  const dateStr = fs.readFileSync(metaPath, 'utf-8').trim()
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

function setLastMonthlyBackupDate() {
  const backupDir = ensureDirectory(getBackupDir())
  fs.writeFileSync(path.join(backupDir, 'last-monthly-backup.txt'), new Date().toISOString(), 'utf-8')
}

function runMonthlyBackupIfNeeded() {
  if (!db || !dbPath) return

  const lastBackup = getLastMonthlyBackupDate()
  const now = new Date()

  // Verifier si > 30 jours depuis la derniere sauvegarde
  if (lastBackup) {
    const daysSince = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) return
  }

  console.log('[DentaStock] Lancement de la sauvegarde mensuelle...')

  try {
    // 1. Sauvegarder la base actuelle en fichier compresse
    const backupDir = ensureDirectory(getBackupDir())
    const timestamp = now.toISOString().slice(0, 7) // YYYY-MM
    const backupName = `dentastock-${timestamp}.db.gz`
    const backupPath = path.join(backupDir, backupName)

    saveDatabase()
    const dbBuffer = fs.readFileSync(dbPath)
    const compressed = zlib.gzipSync(dbBuffer, { level: 9 })
    fs.writeFileSync(backupPath, compressed)

    console.log(`[DentaStock] Backup cree: ${backupPath} (${(compressed.length / 1024).toFixed(0)} Ko)`)

    // 2. Supprimer les anciennes sauvegardes (> 1 an)
    const oneYearAgo = new Date(now)
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('dentastock-') && f.endsWith('.db.gz'))
    for (const file of backupFiles) {
      const match = file.match(/^dentastock-(\d{4}-\d{2})\.db\.gz$/)
      if (match) {
        const fileDate = new Date(match[1] + '-01')
        if (fileDate < oneYearAgo) {
          fs.unlinkSync(path.join(backupDir, file))
          console.log(`[DentaStock] Ancien backup supprime: ${file}`)
        }
      }
    }

    // 3. Nettoyer les donnees > 1 an dans la base
    const cutoffDate = oneYearAgo.toISOString().slice(0, 10)
    cleanupOldData(cutoffDate)

    // 4. VACUUM pour reduire la taille
    db.run('VACUUM')
    saveDatabase()

    setLastMonthlyBackupDate()
    console.log('[DentaStock] Sauvegarde mensuelle terminee.')
  } catch (err) {
    console.error('[DentaStock] Erreur sauvegarde mensuelle:', err.message)
  }
}

function cleanupOldData(cutoffDate) {
  // Supprimer les anciennes utilisations (consommations) et leurs items
  db.run(`DELETE FROM utilisation_items WHERE utilisation_id IN (
    SELECT id FROM utilisations WHERE date < ?
  )`, [cutoffDate])
  const deletedUtilisations = db.exec('SELECT changes() AS c')[0].values[0][0]
  db.run('DELETE FROM utilisations WHERE date < ?', [cutoffDate])

  // Supprimer les anciennes receptions et leurs items/passages
  db.run(`DELETE FROM reception_items WHERE reception_id IN (
    SELECT id FROM receptions WHERE date < ?
  )`, [cutoffDate])
  db.run(`DELETE FROM reception_passages WHERE reception_id IN (
    SELECT id FROM receptions WHERE date < ?
  )`, [cutoffDate])
  db.run('DELETE FROM receptions WHERE date < ?', [cutoffDate])

  // Supprimer les anciennes commandes et leurs items
  db.run(`DELETE FROM commande_items WHERE commande_id IN (
    SELECT id FROM commandes WHERE date_commande < ?
  )`, [cutoffDate])
  db.run('DELETE FROM commandes WHERE date_commande < ?', [cutoffDate])

  console.log(`[DentaStock] Nettoyage: donnees anterieures au ${cutoffDate} supprimees`)
}

function getDefaultDbPath() {
  return path.join(getInstallDir(), 'data', DB_FILENAME)
}

function getDefaultDocumentsRoot() {
  return path.join(getInstallDir(), 'data', 'documents')
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

    dbRun(`INSERT INTO prix_historique (produit_id, fournisseur_id, prix_unitaire, date, source)
      VALUES (?, ?, ?, ?, 'reception')`, [item.produit_id, fournisseurId, prixUnitaire, data.date])

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

  // Colonnes d'archivage
  ensureColumn('produits', 'archived', 'INTEGER DEFAULT 0')
  ensureColumn('fournisseurs', 'archived', 'INTEGER DEFAULT 0')
  ensureColumn('praticiens', 'archived', 'INTEGER DEFAULT 0')

  // Péremption et traçabilité lots
  ensureColumn('produits', 'date_peremption', 'DATE')
  ensureColumn('reception_items', 'lot', 'TEXT')
  ensureColumn('reception_items', 'date_expiration', 'DATE')

  db.run(`CREATE TABLE IF NOT EXISTS prix_historique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produit_id INTEGER REFERENCES produits(id),
    fournisseur_id INTEGER,
    prix_unitaire REAL NOT NULL,
    date TEXT NOT NULL,
    source TEXT DEFAULT 'reception',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run('CREATE INDEX IF NOT EXISTS idx_prix_hist_produit ON prix_historique(produit_id)')

  // Remises fournisseurs
  db.run(`CREATE TABLE IF NOT EXISTS remises_fournisseur (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    seuil_quantite INTEGER NOT NULL DEFAULT 0,
    remise_pourcent REAL NOT NULL DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run('CREATE INDEX IF NOT EXISTS idx_remises_fournisseur ON remises_fournisseur(fournisseur_id)')

  // TVA par produit
  ensureColumn('produits', 'taux_tva', 'REAL DEFAULT 20')
  ensureColumn('produits', 'code_barre', 'TEXT')

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

  // Retours fournisseur
  db.run(`CREATE TABLE IF NOT EXISTS retours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    fournisseur_id INTEGER REFERENCES fournisseurs(id),
    motif TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS retour_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retour_id INTEGER REFERENCES retours(id),
    produit_id INTEGER REFERENCES produits(id),
    quantite INTEGER NOT NULL DEFAULT 0,
    prix_unitaire REAL DEFAULT 0
  )`)
  db.run('CREATE INDEX IF NOT EXISTS idx_retour_items_retour ON retour_items(retour_id)')
  db.run('CREATE INDEX IF NOT EXISTS idx_retour_items_produit ON retour_items(produit_id)')

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
  // Priorite 1 : setup config (serveur/client)
  if (setupConfig && setupConfig.dataPath) {
    if (setupConfig.mode === 'client') {
      return getClientDbPath()
    }
    return path.join(setupConfig.dataPath, DB_FILENAME)
  }

  // Priorite 2 : ancien dbpath.txt
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

// Setup serveur/client
safeHandle('setup:getConfig', () => {
  return setupConfig || null
})

safeHandle('setup:configure', async (_, config) => {
  const { mode, dataPath } = config

  if (mode === 'server') {
    // Mode serveur : base dans le dossier d'installation
    const localDataPath = path.join(getInstallDir(), 'data')
    ensureDirectory(localDataPath)
    saveSetupConfig({ mode: 'server', dataPath: localDataPath })
    await initDatabase(path.join(localDataPath, DB_FILENAME))
    return { success: true, mode: 'server', dataPath: localDataPath }
  }

  if (mode === 'client') {
    // Mode client : base sur le chemin reseau fourni
    if (!dataPath) throw new Error('Veuillez indiquer le chemin reseau vers le dossier data du serveur.')

    const resolvedPath = path.resolve(dataPath)
    const dbFile = path.join(resolvedPath, DB_FILENAME)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Le dossier "${resolvedPath}" est introuvable. Verifiez que le PC serveur est allume et le dossier partage accessible.`)
    }

    if (!fs.existsSync(dbFile)) {
      throw new Error(`Aucune base de donnees trouvee dans "${resolvedPath}". Verifiez que DentaStock est installe en mode serveur sur l autre PC.`)
    }

    saveSetupConfig({ mode: 'client', dataPath: resolvedPath })
    await initDatabase(dbFile)

    // Premiere replica + demarrer la synchro periodique
    replicateFromServer()
    startReplicaSync()

    return { success: true, mode: 'client', dataPath: resolvedPath }
  }

  throw new Error('Mode invalide. Choisissez "server" ou "client".')
})

safeHandle('setup:browseFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selectionner le dossier data du serveur',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

safeHandle('setup:reset', async () => {
  if (replicaInterval) { clearInterval(replicaInterval); replicaInterval = null }
  const configPath = getSetupConfigPath()
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
  setupConfig = null
  return true
})

// Backup & Replica status
safeHandle('backup:status', () => {
  const backupDir = getBackupDir()
  const lastBackup = getLastMonthlyBackupDate()
  let backups = []

  if (fs.existsSync(backupDir)) {
    backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('dentastock-') && f.endsWith('.db.gz'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f))
        return { name: f, size: stats.size, date: stats.mtime.toISOString() }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  const replicaDir = getReplicaDir()
  let replicaInfo = null
  const syncFile = path.join(replicaDir, 'last-sync.txt')
  if (fs.existsSync(syncFile)) {
    replicaInfo = {
      lastSync: fs.readFileSync(syncFile, 'utf-8').trim(),
      exists: fs.existsSync(getReplicaDbPath()),
      size: fs.existsSync(getReplicaDbPath()) ? fs.statSync(getReplicaDbPath()).size : 0,
    }
  }

  return {
    lastMonthlyBackup: lastBackup ? lastBackup.toISOString() : null,
    backups,
    backupDir,
    replica: replicaInfo,
    serverReachable: setupConfig?.mode === 'client' ? isServerReachable() : null,
  }
})

safeHandle('backup:runNow', async () => {
  if (!db) throw new Error('Aucune base ouverte.')
  runMonthlyBackupIfNeeded()
  // Forcer meme si pas encore 30 jours
  const backupDir = ensureDirectory(getBackupDir())
  const timestamp = new Date().toISOString().slice(0, 10)
  const backupName = `dentastock-manual-${timestamp}.db.gz`
  const backupPath = path.join(backupDir, backupName)

  saveDatabase()
  const dbBuffer = fs.readFileSync(dbPath)
  const compressed = zlib.gzipSync(dbBuffer, { level: 9 })
  fs.writeFileSync(backupPath, compressed)
  return backupPath
})

safeHandle('backup:restore', async (_, backupName) => {
  const backupDir = getBackupDir()
  const backupPath = path.join(backupDir, backupName)

  if (!fs.existsSync(backupPath)) throw new Error('Fichier de sauvegarde introuvable.')

  // Decompresser
  const compressed = fs.readFileSync(backupPath)
  const decompressed = zlib.gunzipSync(compressed)

  // Valider la DB
  try {
    const testDb = new SQL.Database(decompressed)
    const tables = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'")
    testDb.close()
    if (!tables.length) throw new Error('Aucune table trouvee.')
  } catch (err) {
    throw new Error(`Sauvegarde invalide: ${err.message}`)
  }

  // Backup de l'actuelle avant restauration
  const safeCopy = `${dbPath}.before-restore.bak`
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, safeCopy)

  // Restaurer
  fs.writeFileSync(dbPath, decompressed)
  loadDatabaseFromFile(dbPath)
  ensureSchema()
  saveDatabase()

  return { restored: backupName, backup: safeCopy }
})

safeHandle('replica:syncNow', async () => {
  const success = replicateFromServer()
  return { success, serverReachable: isServerReachable() }
})

// Fournisseurs
safeHandle('fournisseurs:list', () => dbAll('SELECT * FROM fournisseurs WHERE archived = 0 ORDER BY nom'))

safeHandle('fournisseurs:listArchived', () => dbAll('SELECT * FROM fournisseurs WHERE archived = 1 ORDER BY nom'))

safeHandle('fournisseurs:archive', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE fournisseurs SET archived = 1 WHERE id = ?', [id])
  })
})

safeHandle('fournisseurs:restore', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE fournisseurs SET archived = 0 WHERE id = ?', [id])
  })
})

safeHandle('fournisseurs:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const linked = dbGet('SELECT COUNT(*) AS c FROM produits WHERE fournisseur_id = ?', [id])
    if (linked && linked.c > 0) {
      throw new Error('Ce fournisseur est lie a des produits existants et ne peut pas etre supprime definitivement.')
    }
    dbRun('DELETE FROM fournisseurs WHERE id = ?', [id])
  })
})

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
    WHERE p.archived = 0
    ORDER BY p.nom`)
})

safeHandle('produits:listArchived', () => {
  return dbAll(`SELECT p.*, f.nom AS fournisseur_nom
    FROM produits p
    LEFT JOIN fournisseurs f ON p.fournisseur_id = f.id
    WHERE p.archived = 1
    ORDER BY p.nom`)
})

safeHandle('produits:archive', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE produits SET archived = 1 WHERE id = ?', [id])
  })
})

safeHandle('produits:restore', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE produits SET archived = 0 WHERE id = ?', [id])
  })
})

safeHandle('produits:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const linked = dbGet('SELECT COUNT(*) AS c FROM commande_items WHERE produit_id = ?', [id])
    const linked2 = dbGet('SELECT COUNT(*) AS c FROM utilisation_items WHERE produit_id = ?', [id])
    if ((linked && linked.c > 0) || (linked2 && linked2.c > 0)) {
      throw new Error('Ce produit est lie a des commandes ou consommations et ne peut pas etre supprime definitivement. Archivez-le a la place.')
    }
    dbRun('DELETE FROM produits WHERE id = ?', [id])
  })
})

safeHandle('produits:add', async (_, data) => {
  return withWriteTransaction(() => {
    if (data.categorie) {
      dbRun('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [data.categorie])
    }

    return dbInsert(`INSERT INTO produits (
      reference, nom, categorie, unite, stock_actuel, stock_minimum, prix_unitaire, fournisseur_id, date_peremption, code_barre
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      data.reference,
      data.nom,
      data.categorie,
      data.unite,
      data.stock_actuel || 0,
      data.stock_minimum || 0,
      data.prix_unitaire || 0,
      data.fournisseur_id || null,
      data.date_peremption || null,
      data.code_barre || null,
    ])
  })
})

safeHandle('produits:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    if (data.categorie) {
      dbRun('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [data.categorie])
    }

    dbRun(`UPDATE produits
      SET reference = ?, nom = ?, categorie = ?, unite = ?, stock_actuel = ?, stock_minimum = ?, prix_unitaire = ?, fournisseur_id = ?, date_peremption = ?, code_barre = ?
      WHERE id = ?`, [
      data.reference,
      data.nom,
      data.categorie,
      data.unite,
      data.stock_actuel,
      data.stock_minimum,
      data.prix_unitaire,
      data.fournisseur_id,
      data.date_peremption || null,
      data.code_barre || null,
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

safeHandle('commandes:delete', async (_, id) => {
  await withWriteTransaction(() => {
    // Supprimer les items de la commande puis la commande elle-meme
    dbRun('DELETE FROM commande_items WHERE commande_id = ?', [id])
    dbRun('DELETE FROM commandes WHERE id = ?', [id])
  })
})

safeHandle('commandes:exportPdf', async (_, commandeId) => {
  const commande = dbGet(`SELECT c.*, f.nom AS fournisseur_nom, f.adresse AS fournisseur_adresse,
    f.telephone AS fournisseur_telephone, f.email AS fournisseur_email
    FROM commandes c
    LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
    WHERE c.id = ?`, [commandeId])
  if (!commande) throw new Error('Commande introuvable.')

  const items = dbAll(`SELECT ci.*, p.nom AS produit_nom, p.reference, p.unite
    FROM commande_items ci
    LEFT JOIN produits p ON ci.produit_id = p.id
    WHERE ci.commande_id = ?
    ORDER BY p.nom`, [commandeId])

  const cabinetNom = (dbGet("SELECT valeur FROM config WHERE cle = 'cabinet_nom'") || {}).valeur || 'Cabinet Dentaire'
  const cabinetAdresse = (dbGet("SELECT valeur FROM config WHERE cle = 'cabinet_adresse'") || {}).valeur || ''

  const total = items.reduce((s, i) => s + (i.quantite || 0) * (i.prix_unitaire || 0), 0)
  const formatDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '-'
  const formatMoney = v => Number(v || 0).toFixed(2).replace('.', ',') + ' \u20ac'

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; font-size: 13px; }
    h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
    .ref { font-size: 14px; color: #64748b; margin-bottom: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .header-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; min-width: 240px; }
    .header-box h3 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }
    .header-box p { margin: 2px 0; font-size: 13px; }
    .meta { display: flex; gap: 30px; margin-bottom: 20px; }
    .meta-item { font-size: 12px; color: #64748b; }
    .meta-item strong { color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .total-row td { border-top: 2px solid #e2e8f0; font-weight: bold; font-size: 14px; padding-top: 14px; }
    .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .notes { margin-top: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 12px; }
  </style></head><body>
    <h1>Bon de Commande</h1>
    <div class="ref">${commande.reference_commande || 'CMD-' + commandeId}</div>
    <div class="header">
      <div class="header-box">
        <h3>Emetteur</h3>
        <p><strong>${cabinetNom}</strong></p>
        ${cabinetAdresse ? '<p>' + cabinetAdresse.replace(/\n/g, '<br>') + '</p>' : ''}
      </div>
      <div class="header-box">
        <h3>Fournisseur</h3>
        <p><strong>${commande.fournisseur_nom || 'Non renseigne'}</strong></p>
        ${commande.fournisseur_adresse ? '<p>' + commande.fournisseur_adresse.replace(/\n/g, '<br>') + '</p>' : ''}
        ${commande.fournisseur_telephone ? '<p>Tel: ' + commande.fournisseur_telephone + '</p>' : ''}
        ${commande.fournisseur_email ? '<p>Email: ' + commande.fournisseur_email + '</p>' : ''}
      </div>
    </div>
    <div class="meta">
      <div class="meta-item">Date commande : <strong>${formatDate(commande.date_commande)}</strong></div>
      <div class="meta-item">Livraison souhaitee : <strong>${formatDate(commande.date_prevue)}</strong></div>
      <div class="meta-item">Statut : <strong>${commande.statut || 'EN_ATTENTE'}</strong></div>
    </div>
    <table>
      <thead><tr><th>Reference</th><th>Produit</th><th>Unite</th><th class="text-right">Quantite</th><th class="text-right">Prix unit. HT</th><th class="text-right">Total HT</th></tr></thead>
      <tbody>
        ${items.map(i => '<tr><td>' + (i.reference || '-') + '</td><td>' + (i.produit_nom || '-') + '</td><td>' + (i.unite || '-') + '</td><td class="text-right">' + (i.quantite || 0) + '</td><td class="text-right">' + formatMoney(i.prix_unitaire) + '</td><td class="text-right">' + formatMoney((i.quantite || 0) * (i.prix_unitaire || 0)) + '</td></tr>').join('')}
        <tr class="total-row"><td colspan="5" class="text-right">Total HT :</td><td class="text-right">${formatMoney(total)}</td></tr>
      </tbody>
    </table>
    ${commande.notes ? '<div class="notes"><strong>Notes :</strong> ' + commande.notes + '</div>' : ''}
    <div class="footer">Document genere par DentaStock le ${new Date().toLocaleDateString('fr-FR')}</div>
  </body></html>`

  const pdfWindow = new BrowserWindow({ show: false, width: 800, height: 600 })
  await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const pdfBuffer = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    marginType: 0,
    pageSize: 'A4',
  })
  pdfWindow.destroy()

  const defaultName = `${commande.reference_commande || 'commande-' + commandeId}.pdf`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer le bon de commande',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (result.canceled || !result.filePath) return { success: false }

  fs.writeFileSync(result.filePath, pdfBuffer)
  return { success: true, path: result.filePath }
})

// Inventaire
safeHandle('inventaire:list', () => {
  return dbAll(`SELECT id, reference, nom, categorie, unite, stock_actuel, stock_minimum, prix_unitaire
    FROM produits WHERE archived = 0 ORDER BY categorie, nom`)
})

safeHandle('inventaire:adjust', async (_, adjustments) => {
  // adjustments = [{ produit_id, stock_reel, motif }]
  return withWriteTransaction(() => {
    let count = 0
    for (const adj of adjustments) {
      if (adj.stock_reel !== undefined && adj.stock_reel !== null) {
        dbRun('UPDATE produits SET stock_actuel = ? WHERE id = ?', [adj.stock_reel, adj.produit_id])
        count++
      }
    }
    return { adjusted: count }
  })
})

// Retours fournisseur
safeHandle('retours:list', () => {
  return dbAll(`SELECT r.*, f.nom AS fournisseur_nom,
    (SELECT COUNT(*) FROM retour_items ri WHERE ri.retour_id = r.id) AS nb_produits,
    (SELECT SUM(ri.quantite * ri.prix_unitaire) FROM retour_items ri WHERE ri.retour_id = r.id) AS montant_total
    FROM retours r
    LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
    ORDER BY r.date DESC
    LIMIT 50`)
})

safeHandle('retours:add', async (_, data) => {
  return withWriteTransaction(() => {
    const retourId = dbInsert(`INSERT INTO retours (date, fournisseur_id, motif, notes)
      VALUES (?, ?, ?, ?)`, [
      data.date || new Date().toISOString().split('T')[0],
      data.fournisseur_id || null,
      data.motif || null,
      data.notes || null,
    ])

    for (const item of data.items || []) {
      dbRun(`INSERT INTO retour_items (retour_id, produit_id, quantite, prix_unitaire)
        VALUES (?, ?, ?, ?)`, [retourId, item.produit_id, Number(item.quantite || 0), Number(item.prix_unitaire || 0)])
      // Deduct from stock
      dbRun('UPDATE produits SET stock_actuel = MAX(0, stock_actuel - ?) WHERE id = ?', [Number(item.quantite || 0), item.produit_id])
    }

    return retourId
  })
})

// Praticiens
safeHandle('praticiens:list', () => dbAll('SELECT * FROM praticiens WHERE archived = 0 ORDER BY nom'))

safeHandle('praticiens:listArchived', () => dbAll('SELECT * FROM praticiens WHERE archived = 1 ORDER BY nom'))

safeHandle('praticiens:archive', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE praticiens SET archived = 1 WHERE id = ?', [id])
  })
})

safeHandle('praticiens:restore', async (_, id) => {
  await withWriteTransaction(() => {
    dbRun('UPDATE praticiens SET archived = 0 WHERE id = ?', [id])
  })
})

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
      throw new Error('Ce praticien est lie a des consommations existantes et ne peut pas etre supprime definitivement. Archivez-le a la place.')
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

      dbRun(`INSERT INTO prix_historique (produit_id, fournisseur_id, prix_unitaire, date, source)
        VALUES (?, ?, ?, ?, 'reception')`, [item.produit_id, data.fournisseur_id, prixUnitaire, data.date])

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

// Export / Import base de donnees
safeHandle('db:export', async () => {
  if (!db) throw new Error('Aucune base de donnees ouverte.')

  const timestamp = new Date().toISOString().slice(0, 10)
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter la base de donnees',
    defaultPath: `dentastock-backup-${timestamp}.db`,
    filters: [{ name: 'Base SQLite', extensions: ['db'] }],
  })

  if (result.canceled || !result.filePath) return null

  saveDatabase()
  fs.copyFileSync(dbPath, result.filePath)
  return result.filePath
})

safeHandle('db:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer une base de donnees',
    filters: [{ name: 'Base SQLite', extensions: ['db'] }],
    properties: ['openFile'],
  })

  if (result.canceled || !result.filePaths.length) return null

  const importPath = result.filePaths[0]

  // Verifier que le fichier est une DB valide
  try {
    const testDb = new SQL.Database(fs.readFileSync(importPath))
    const tables = testDb.exec("SELECT name FROM sqlite_master WHERE type='table'")
    testDb.close()
    if (!tables.length || tables[0].values.length === 0) {
      throw new Error('Le fichier ne contient aucune table.')
    }
  } catch (err) {
    throw new Error(`Fichier invalide : ${err.message}`)
  }

  // Sauvegarder l'ancienne DB avant ecrasement
  const backupPath = `${dbPath}.before-import.bak`
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath)
  }

  // Remplacer la DB
  fs.copyFileSync(importPath, dbPath)
  loadDatabaseFromFile(dbPath)
  ensureSchema()
  saveDatabase()

  return { imported: importPath, backup: backupPath }
})

// --- Stats & Analytics ---
safeHandle('stats:monthly', () => {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const ym = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })

    const achats = dbGet(`SELECT COALESCE(SUM(ri.quantite * ri.prix_unitaire), 0) as total
      FROM reception_items ri
      JOIN receptions r ON r.id = ri.reception_id
      WHERE r.date LIKE ?`, [ym + '%'])

    const conso = dbGet(`SELECT COALESCE(COUNT(DISTINCT u.id), 0) as nb,
      COALESCE(SUM(ui.quantite), 0) as total_items
      FROM utilisations u
      LEFT JOIN utilisation_items ui ON ui.utilisation_id = u.id
      WHERE u.date LIKE ?`, [ym + '%'])

    const receptions = dbGet(`SELECT COUNT(*) as nb FROM receptions WHERE date LIKE ?`, [ym + '%'])

    months.push({
      label,
      month: ym,
      achats: achats?.total || 0,
      consommations: conso?.nb || 0,
      items_consommes: conso?.total_items || 0,
      receptions: receptions?.nb || 0,
    })
  }
  return months
})

safeHandle('stats:topProduits', () => {
  return dbAll(`SELECT p.id, p.nom, p.reference, p.categorie,
    COALESCE(SUM(ui.quantite), 0) as total_consomme,
    COUNT(DISTINCT u.id) as nb_soins
    FROM utilisation_items ui
    JOIN utilisations u ON u.id = ui.utilisation_id
    JOIN produits p ON p.id = ui.produit_id
    WHERE u.date >= date('now', '-6 months')
    GROUP BY p.id
    ORDER BY total_consomme DESC
    LIMIT 10`)
})

safeHandle('stats:parCategorie', () => {
  return dbAll(`SELECT categorie, COUNT(*) as nb_produits,
    SUM(stock_actuel) as stock_total,
    SUM(stock_actuel * prix_unitaire) as valeur_stock
    FROM produits WHERE archived = 0 AND categorie IS NOT NULL
    GROUP BY categorie ORDER BY valeur_stock DESC`)
})

safeHandle('stats:parFournisseur', () => {
  return dbAll(`SELECT f.id, f.nom,
    COUNT(DISTINCT p.id) as nb_produits,
    COALESCE(SUM(ri.quantite * ri.prix_unitaire), 0) as total_achats
    FROM fournisseurs f
    LEFT JOIN produits p ON p.fournisseur_id = f.id AND p.archived = 0
    LEFT JOIN reception_items ri ON ri.produit_id = p.id
    LEFT JOIN receptions r ON r.id = ri.reception_id AND r.date >= date('now', '-6 months')
    WHERE f.archived = 0
    GROUP BY f.id ORDER BY total_achats DESC`)
})

safeHandle('stats:alertesPeremption', () => {
  return dbAll(`SELECT p.id, p.nom, p.reference, p.date_peremption, p.stock_actuel, p.unite
    FROM produits p
    WHERE p.archived = 0 AND p.date_peremption IS NOT NULL
    AND p.date_peremption <= date('now', '+90 days')
    ORDER BY p.date_peremption ASC`)
})

safeHandle('stats:valeurStock', () => {
  const row = dbGet(`SELECT
    COUNT(*) as nb_produits,
    SUM(stock_actuel * prix_unitaire) as valeur_totale,
    SUM(CASE WHEN stock_actuel <= stock_minimum THEN 1 ELSE 0 END) as nb_alertes
    FROM produits WHERE archived = 0`)
  return row || { nb_produits: 0, valeur_totale: 0, nb_alertes: 0 }
})

// --- Commande automatique ---
safeHandle('commandes:autoGenerate', async () => {
  const alertProducts = dbAll(`SELECT p.id, p.nom, p.stock_actuel, p.stock_minimum, p.prix_unitaire, p.fournisseur_id
    FROM produits p WHERE p.archived = 0 AND p.stock_actuel <= p.stock_minimum AND p.fournisseur_id IS NOT NULL`)

  if (alertProducts.length === 0) return { created: 0, commandes: [] }

  // Grouper par fournisseur
  const byFournisseur = {}
  alertProducts.forEach(p => {
    if (!byFournisseur[p.fournisseur_id]) byFournisseur[p.fournisseur_id] = []
    byFournisseur[p.fournisseur_id].push(p)
  })

  const createdCommandes = []
  const today = new Date().toISOString().slice(0, 10)

  await withWriteTransaction(() => {
    for (const [fournisseurId, produits] of Object.entries(byFournisseur)) {
      const refNum = Math.floor(Math.random() * 9000) + 1000
      const ref = `CMD-AUTO-${today.replace(/-/g, '')}-${refNum}`

      dbRun(`INSERT INTO commandes (date_commande, fournisseur_id, reference_commande, statut, notes)
        VALUES (?, ?, ?, 'EN_ATTENTE', 'Commande generee automatiquement')`,
        [today, fournisseurId, ref])

      const commandeId = dbGet('SELECT last_insert_rowid() as id').id

      produits.forEach(p => {
        const qte = Math.max(1, Math.ceil((p.stock_minimum * 2) - p.stock_actuel))
        dbRun(`INSERT INTO commande_items (commande_id, produit_id, quantite, prix_unitaire)
          VALUES (?, ?, ?, ?)`, [commandeId, p.id, qte, p.prix_unitaire || 0])
      })

      createdCommandes.push({ id: commandeId, reference: ref, fournisseur_id: Number(fournisseurId), nb_produits: produits.length })
    }
  })

  return { created: createdCommandes.length, commandes: createdCommandes }
})

// --- Export CSV ---
safeHandle('export:csv', async (_, type) => {
  let rows = []
  let filename = ''
  let headers = []

  if (type === 'produits') {
    headers = ['Reference', 'Nom', 'Categorie', 'Unite', 'Stock', 'Seuil', 'Prix HT', 'Fournisseur', 'Peremption']
    rows = dbAll(`SELECT p.reference, p.nom, p.categorie, p.unite, p.stock_actuel, p.stock_minimum, p.prix_unitaire,
      f.nom as fournisseur_nom, p.date_peremption
      FROM produits p LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
      WHERE p.archived = 0 ORDER BY p.nom`)
    rows = rows.map(r => [r.reference || '', r.nom, r.categorie || '', r.unite, r.stock_actuel, r.stock_minimum, r.prix_unitaire, r.fournisseur_nom || '', r.date_peremption || ''])
    filename = `produits-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === 'commandes') {
    headers = ['Reference', 'Date', 'Fournisseur', 'Statut', 'Nb produits', 'Notes']
    rows = dbAll(`SELECT c.reference_commande, c.date_commande, f.nom as fournisseur_nom, c.statut,
      (SELECT COUNT(*) FROM commande_items ci WHERE ci.commande_id = c.id) as nb_produits, c.notes
      FROM commandes c LEFT JOIN fournisseurs f ON f.id = c.fournisseur_id ORDER BY c.date_commande DESC`)
    rows = rows.map(r => [r.reference_commande || '', r.date_commande, r.fournisseur_nom || '', r.statut, r.nb_produits, r.notes || ''])
    filename = `commandes-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === 'consommations') {
    headers = ['Date', 'Praticien', 'Type soin', 'Patient', 'Nb produits', 'Notes']
    rows = dbAll(`SELECT u.date, COALESCE(pr.prenom || ' ' || pr.nom, '-') as praticien, u.type_soin, u.patient_ref,
      (SELECT COUNT(*) FROM utilisation_items ui WHERE ui.utilisation_id = u.id) as nb_produits, u.notes
      FROM utilisations u LEFT JOIN praticiens pr ON pr.id = u.praticien_id ORDER BY u.date DESC`)
    rows = rows.map(r => [r.date, r.praticien, r.type_soin || '', r.patient_ref || '', r.nb_produits, r.notes || ''])
    filename = `consommations-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === 'fournisseurs') {
    headers = ['Nom', 'Contact', 'Email', 'Telephone', 'Adresse', 'Nb produits']
    rows = dbAll(`SELECT f.nom, f.contact_commercial, f.email, f.telephone, f.adresse,
      (SELECT COUNT(*) FROM produits p WHERE p.fournisseur_id = f.id AND p.archived = 0) as nb_produits
      FROM fournisseurs f WHERE f.archived = 0 ORDER BY f.nom`)
    rows = rows.map(r => [r.nom, r.contact_commercial || '', r.email || '', r.telephone || '', r.adresse || '', r.nb_produits])
    filename = `fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`
  } else {
    throw new Error(`Type d'export inconnu: ${type}`)
  }

  const csvContent = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n')

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter en CSV',
    defaultPath: filename,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })

  if (result.canceled || !result.filePath) return null

  fs.writeFileSync(result.filePath, '\uFEFF' + csvContent, 'utf-8')
  return result.filePath
})

// --- Prix historique ---
safeHandle('prix:historique', (_, produitId) => {
  return dbAll(`SELECT ph.*, f.nom as fournisseur_nom
    FROM prix_historique ph
    LEFT JOIN fournisseurs f ON f.id = ph.fournisseur_id
    WHERE ph.produit_id = ?
    ORDER BY ph.date DESC LIMIT 50`, [produitId])
})

// --- Recherche globale ---
safeHandle('search:global', (_, query) => {
  if (!query || query.trim().length < 2) return { produits: [], fournisseurs: [], commandes: [] }
  const q = `%${query.trim()}%`

  const produits = dbAll(`SELECT id, reference, nom, categorie, stock_actuel, stock_minimum, unite
    FROM produits WHERE archived = 0 AND (nom LIKE ? OR reference LIKE ? OR categorie LIKE ?)
    ORDER BY nom LIMIT 10`, [q, q, q])

  const fournisseurs = dbAll(`SELECT id, nom, contact_commercial, email
    FROM fournisseurs WHERE archived = 0 AND (nom LIKE ? OR contact_commercial LIKE ? OR email LIKE ?)
    ORDER BY nom LIMIT 5`, [q, q, q])

  const commandes = dbAll(`SELECT c.id, c.reference_commande, c.date_commande, c.statut, f.nom as fournisseur_nom
    FROM commandes c LEFT JOIN fournisseurs f ON f.id = c.fournisseur_id
    WHERE c.reference_commande LIKE ? OR f.nom LIKE ?
    ORDER BY c.date_commande DESC LIMIT 5`, [q, q])

  return { produits, fournisseurs, commandes }
})

// Analyse de consommation - recommandation de seuils
safeHandle('produits:seuilRecommande', (_, produitId) => {
  // Analyser la consommation des 6 derniers mois
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const dateLimit = sixMonthsAgo.toISOString().slice(0, 10)

  const consos = dbAll(`
    SELECT ui.quantite, u.date
    FROM utilisation_items ui
    JOIN utilisations u ON u.id = ui.utilisation_id
    WHERE ui.produit_id = ? AND u.date >= ?
    ORDER BY u.date ASC
  `, [produitId, dateLimit])

  if (consos.length === 0) {
    return { recommandation: null, message: 'Pas assez de donnees de consommation (aucune utilisation sur 6 mois).' }
  }

  // Calcul conso totale et moyenne par mois
  const totalQty = consos.reduce((s, c) => s + Number(c.quantite || 0), 0)
  const months = new Set(consos.map(c => c.date.slice(0, 7)))
  const nbMonths = Math.max(months.size, 1)
  const moyenneMensuelle = totalQty / nbMonths

  // Calcul du delai moyen de livraison (temps entre commande et reception)
  const delais = dbAll(`
    SELECT AVG(julianday(r.date) - julianday(c.date_commande)) as avg_delai
    FROM receptions r
    JOIN commandes c ON c.id = r.commande_id
    WHERE r.date >= ? AND c.date_commande IS NOT NULL
  `, [dateLimit])

  const delaiJours = delais[0]?.avg_delai || 14 // 14 jours par defaut

  // Seuil = (conso mensuelle / 30) * delai livraison * 1.3 (marge securite 30%)
  const consoJournaliere = moyenneMensuelle / 30
  const seuil = Math.ceil(consoJournaliere * delaiJours * 1.3)

  // Mois les plus consommateurs
  const parMois = {}
  consos.forEach(c => {
    const m = c.date.slice(0, 7)
    parMois[m] = (parMois[m] || 0) + Number(c.quantite || 0)
  })

  return {
    recommandation: seuil,
    moyenneMensuelle: Math.round(moyenneMensuelle * 10) / 10,
    delaiLivraisonJours: Math.round(delaiJours),
    nbUtilisations: consos.length,
    totalConsomme: totalQty,
    parMois,
    message: `Seuil recommande : ${seuil} unites (basé sur ${moyenneMensuelle.toFixed(1)} unites/mois, delai livraison ~${Math.round(delaiJours)}j, marge securite 30%).`
  }
})

// Remises fournisseurs CRUD
safeHandle('remises:list', (_, fournisseurId) => {
  return dbAll('SELECT * FROM remises_fournisseur WHERE fournisseur_id = ? ORDER BY seuil_quantite ASC', [fournisseurId])
})

safeHandle('remises:add', async (_, data) => {
  return withWriteTransaction(() => {
    dbRun('INSERT INTO remises_fournisseur (fournisseur_id, seuil_quantite, remise_pourcent, description) VALUES (?, ?, ?, ?)',
      [data.fournisseur_id, data.seuil_quantite, data.remise_pourcent, data.description || null])
  })
})

safeHandle('remises:update', async (_, id, data) => {
  return withWriteTransaction(() => {
    dbRun('UPDATE remises_fournisseur SET seuil_quantite = ?, remise_pourcent = ?, description = ? WHERE id = ?',
      [data.seuil_quantite, data.remise_pourcent, data.description || null, id])
  })
})

safeHandle('remises:delete', async (_, id) => {
  return withWriteTransaction(() => {
    dbRun('DELETE FROM remises_fournisseur WHERE id = ?', [id])
  })
})

// Calcul prix avec remise
safeHandle('prix:calculer', (_, { prixUnitaireHT, quantite, tauxTva, fournisseurId }) => {
  const tva = tauxTva || 20
  let remisePourcent = 0
  let remiseDescription = ''

  if (fournisseurId) {
    const remises = dbAll('SELECT * FROM remises_fournisseur WHERE fournisseur_id = ? AND seuil_quantite <= ? ORDER BY seuil_quantite DESC LIMIT 1',
      [fournisseurId, quantite])
    if (remises.length > 0) {
      remisePourcent = remises[0].remise_pourcent
      remiseDescription = remises[0].description || `Remise ${remisePourcent}%`
    }
  }

  const totalHT = prixUnitaireHT * quantite
  const montantRemise = totalHT * (remisePourcent / 100)
  const totalHTRemise = totalHT - montantRemise
  const montantTVA = totalHTRemise * (tva / 100)
  const totalTTC = totalHTRemise + montantTVA

  return {
    prixUnitaireHT,
    quantite,
    totalHT: Math.round(totalHT * 100) / 100,
    remisePourcent,
    remiseDescription,
    montantRemise: Math.round(montantRemise * 100) / 100,
    totalHTRemise: Math.round(totalHTRemise * 100) / 100,
    tauxTva: tva,
    montantTVA: Math.round(montantTVA * 100) / 100,
    totalTTC: Math.round(totalTTC * 100) / 100,
  }
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
    // Auto-update
    try {
      const autoUpdate = require('./auto-update')
      autoUpdate.init(mainWindow)
    } catch (e) {
      console.error('[DentaStock] Auto-update init error:', e.message)
    }
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }
}

app.whenReady().then(async () => {
  const userDataPath = getUserDataPath()
  dbConfigFile = path.join(userDataPath, 'dbpath.txt')
  storageConfigFile = path.join(userDataPath, 'storage-root.txt')

  // Charger la config setup
  setupConfig = loadSetupConfig()

  // Si deja configure, initialiser la base
  if (setupConfig) {
    try {
      if (setupConfig.mode === 'client') {
        // Mode client : essayer le serveur, sinon fallback replica
        const targetDb = getClientDbPath()
        await initDatabase(targetDb)
        startReplicaSync()
      } else {
        await initDatabase(resolveInitialDbPath())
      }
    } catch (error) {
      dialog.showErrorBox('Erreur base de donnees', `Impossible d'ouvrir la base de donnees : ${error.message}`)
      app.quit()
      return
    }

    // Sauvegarde mensuelle automatique (serveur uniquement)
    if (setupConfig.mode === 'server') {
      try { runMonthlyBackupIfNeeded() } catch (err) {
        console.error('[DentaStock] Erreur backup mensuel:', err.message)
      }
    }
  } else {
    // Pas encore configure : on verifie si une base existe deja (migration ancienne install)
    const defaultDb = getDefaultDbPath()
    if (fs.existsSync(defaultDb) && fs.statSync(defaultDb).size > 0) {
      // Ancienne install, migrer vers mode serveur automatiquement
      const localDataPath = path.join(getInstallDir(), 'data')
      saveSetupConfig({ mode: 'server', dataPath: localDataPath })
      try {
        await initDatabase(defaultDb)
        try { runMonthlyBackupIfNeeded() } catch (err) {
          console.error('[DentaStock] Erreur backup mensuel:', err.message)
        }
      } catch (error) {
        dialog.showErrorBox('Erreur base de donnees', `Impossible d'ouvrir la base de donnees : ${error.message}`)
        app.quit()
        return
      }
    }
    // Sinon, l'ecran de setup sera affiche par le frontend
  }

  createWindow()

  // Notifications d'alerte au démarrage
  if (db) {
    try {
      const alerteStock = dbGet('SELECT COUNT(*) AS c FROM produits WHERE archived = 0 AND stock_actuel <= stock_minimum')
      const alertePeremption = dbGet(`SELECT COUNT(*) AS c FROM produits
        WHERE archived = 0 AND date_peremption IS NOT NULL AND date_peremption <= date('now', '+30 days') AND stock_actuel > 0`)
      const messages = []
      if (alerteStock && alerteStock.c > 0) messages.push(`${alerteStock.c} produit${alerteStock.c > 1 ? 's' : ''} en rupture de stock`)
      if (alertePeremption && alertePeremption.c > 0) messages.push(`${alertePeremption.c} produit${alertePeremption.c > 1 ? 's' : ''} proche${alertePeremption.c > 1 ? 's' : ''} de la peremption`)
      if (messages.length > 0 && Notification.isSupported()) {
        new Notification({
          title: 'DentaStock - Alertes',
          body: messages.join('\n'),
          icon: path.join(__dirname, '../build/icon.png'),
        }).show()
      }
    } catch (e) { console.error('[DentaStock] Notification error:', e.message) }
  }

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
  if (replicaInterval) { clearInterval(replicaInterval); replicaInterval = null }
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
