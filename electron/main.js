const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
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

const VALID_PROFILE_ROLES = ['ADMIN', 'EQUIPE', 'LECTURE']
const VALID_OPERATOR_STATUS = ['ACTIF', 'INACTIF']
const OPERATOR_PERMISSION_KEYS = [
  'commandes_generate',
  'commandes_edit',
  'receptions_edit',
  'stock_edit',
  'fournisseurs_edit',
  'produits_edit',
  'praticiens_edit',
  'utilisateurs_edit',
  'parametres_edit',
  'sauvegardes_edit',
]

let currentSession = {
  operatorId: null,
  loginAt: null,
}

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

// Dossier de donnees persistant, hors install dir, qui survit aux mises a jour NSIS
function getDataRoot() {
  if (app.isPackaged) {
    const programData = process.env.ProgramData || 'C:\\ProgramData'
    return path.join(programData, 'DentaStock')
  }
  return path.join(__dirname, '..')
}

function getServerLocalDataPath() {
  return path.join(getDataRoot(), 'data')
}

function getSetupConfigPath() {
  return path.join(getDataRoot(), SETUP_CONFIG_FILENAME)
}

function getLegacyInstallDirPath(name) {
  return path.join(getInstallDir(), name)
}

// Migration unique : recupere la config et les donnees laissees dans l'ancien
// emplacement (install dir) avant qu'une mise a jour NSIS ne les efface.
function migrateLegacyDataIfNeeded() {
  if (!app.isPackaged) return

  try {
    ensureDirectory(getDataRoot())

    // 1) Setup config
    const newConfigPath = getSetupConfigPath()
    const oldConfigPath = getLegacyInstallDirPath(SETUP_CONFIG_FILENAME)
    if (!fs.existsSync(newConfigPath) && fs.existsSync(oldConfigPath)) {
      try {
        const raw = fs.readFileSync(oldConfigPath, 'utf-8')
        const parsed = JSON.parse(raw)

        // Si dataPath pointait vers le dossier data DANS install dir,
        // copier ce dossier (DB + sous-dossiers) vers le nouveau dataRoot
        if (parsed && parsed.mode === 'server' && parsed.dataPath) {
          const oldData = path.resolve(parsed.dataPath)
          const installDir = path.resolve(getInstallDir())
          const isInsideInstall = oldData === path.join(installDir, 'data') || oldData.startsWith(installDir + path.sep)

          if (isInsideInstall && fs.existsSync(oldData)) {
            const newData = getServerLocalDataPath()
            ensureDirectory(newData)
            copyDirectoryRecursive(oldData, newData)
            parsed.dataPath = newData
            console.log(`[DentaStock] Migration data: ${oldData} -> ${newData}`)
          }
        }

        fs.writeFileSync(newConfigPath, JSON.stringify(parsed, null, 2), 'utf-8')
        console.log(`[DentaStock] Migration setup config: ${oldConfigPath} -> ${newConfigPath}`)
      } catch (err) {
        console.error('[DentaStock] Echec migration setup config:', err.message)
      }
    }

    // 2) Backups historiques (etaient dans install/data/backups)
    const oldBackupsDir = path.join(getInstallDir(), 'data', 'backups')
    const newBackupsDir = getBackupDir()
    if (fs.existsSync(oldBackupsDir) && oldBackupsDir !== newBackupsDir) {
      try {
        ensureDirectory(newBackupsDir)
        copyDirectoryRecursive(oldBackupsDir, newBackupsDir)
        console.log(`[DentaStock] Migration backups: ${oldBackupsDir} -> ${newBackupsDir}`)
      } catch (err) {
        console.error('[DentaStock] Echec migration backups:', err.message)
      }
    }

    // 3) Replica locale (etait dans install/data/replica)
    const oldReplicaDir = path.join(getInstallDir(), 'data', 'replica')
    const newReplicaDir = getReplicaDir()
    if (fs.existsSync(oldReplicaDir) && oldReplicaDir !== newReplicaDir) {
      try {
        ensureDirectory(newReplicaDir)
        copyDirectoryRecursive(oldReplicaDir, newReplicaDir)
        console.log(`[DentaStock] Migration replica: ${oldReplicaDir} -> ${newReplicaDir}`)
      } catch (err) {
        console.error('[DentaStock] Echec migration replica:', err.message)
      }
    }
  } catch (err) {
    console.error('[DentaStock] Migration legacy data:', err.message)
  }
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) return
  ensureDirectory(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      // Ne pas ecraser si la cible existe deja (priorite au nouveau)
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }
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

function getConfiguredClientServerDbPath(config = setupConfig) {
  if (!config || config.mode !== 'client' || !config.dataPath) return null
  return path.join(config.dataPath, DB_FILENAME)
}

function getReplicaDir() {
  return path.join(getDataRoot(), 'replica')
}

function getReplicaDbPath() {
  return path.join(getReplicaDir(), DB_FILENAME)
}

function replicateFromServer() {
  if (!setupConfig || setupConfig.mode !== 'client' || !setupConfig.dataPath) return false

  const serverDb = getConfiguredClientServerDbPath()
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

function getClientConnectionStatus(config = setupConfig) {
  if (!config || config.mode !== 'client') {
    return {
      mode: config?.mode || null,
      dataPath: config?.dataPath || null,
      serverDbPath: null,
      serverReachable: null,
      replicaDbPath: null,
      replicaAvailable: false,
      usingReplica: false,
      readOnly: false,
      activeDbPath: dbPath || null,
    }
  }

  const serverDbPath = getConfiguredClientServerDbPath(config)
  const replicaDbPath = getReplicaDbPath()

  let serverReachable = false
  try {
    serverReachable = Boolean(serverDbPath && fs.existsSync(serverDbPath))
  } catch {
    serverReachable = false
  }

  const replicaAvailable = fs.existsSync(replicaDbPath)
  const activeResolved = dbPath ? path.resolve(dbPath) : ''
  const replicaResolved = path.resolve(replicaDbPath)

  return {
    mode: 'client',
    dataPath: config.dataPath,
    serverDbPath,
    serverReachable,
    replicaDbPath,
    replicaAvailable,
    usingReplica: activeResolved === replicaResolved,
    readOnly: !serverReachable,
    activeDbPath: dbPath || null,
  }
}

function syncClientConnectionState({ syncReplica = false, allowSwitch = true } = {}) {
  const status = getClientConnectionStatus()
  if (status.mode !== 'client') return status

  if (status.serverReachable) {
    if (allowSwitch && status.serverDbPath && status.activeDbPath && path.resolve(status.activeDbPath) !== path.resolve(status.serverDbPath)) {
      switchDatabasePath(status.serverDbPath)
    }

    if (syncReplica) {
      replicateFromServer()
    }
  } else if (allowSwitch && status.replicaAvailable && status.activeDbPath && path.resolve(status.activeDbPath) !== path.resolve(status.replicaDbPath)) {
    switchDatabasePath(status.replicaDbPath)
  }

  return getClientConnectionStatus()
}

function startReplicaSync(intervalMs = 5 * 60 * 1000) {
  if (replicaInterval) clearInterval(replicaInterval)
  syncClientConnectionState({ syncReplica: true, allowSwitch: true })
  replicaInterval = setInterval(() => syncClientConnectionState({ syncReplica: true, allowSwitch: true }), intervalMs)
}

function isServerReachable() {
  const status = getClientConnectionStatus()
  return status.serverReachable !== null ? status.serverReachable : true
}

function getClientDbPath() {
  const serverDb = getConfiguredClientServerDbPath()
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

function promoteReplicaToServer() {
  const replicaPath = getReplicaDbPath()
  if (!fs.existsSync(replicaPath)) {
    throw new Error('Aucune copie locale de secours n est disponible pour basculer ce poste en serveur.')
  }

  const localDataPath = getServerLocalDataPath()
  const targetDb = path.join(localDataPath, DB_FILENAME)
  ensureDirectory(localDataPath)

  if (replicaInterval) {
    clearInterval(replicaInterval)
    replicaInterval = null
  }

  if (fs.existsSync(targetDb)) {
    const backupName = `dentastock-before-promotion-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
    fs.copyFileSync(targetDb, path.join(localDataPath, backupName))
  }

  fs.copyFileSync(replicaPath, targetDb)
  saveSetupConfig({ mode: 'server', dataPath: localDataPath })

  return { localDataPath, targetDb }
}

// --- Sauvegarde mensuelle automatique ---
function getBackupDir() {
  return path.join(getDataRoot(), 'backups')
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

function getLastWeeklyBackupDate() {
  const metaPath = path.join(getBackupDir(), 'last-weekly-backup.txt')
  if (!fs.existsSync(metaPath)) return null
  const dateStr = fs.readFileSync(metaPath, 'utf-8').trim()
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

function setLastWeeklyBackupDate() {
  const backupDir = ensureDirectory(getBackupDir())
  fs.writeFileSync(path.join(backupDir, 'last-weekly-backup.txt'), new Date().toISOString(), 'utf-8')
}

function createBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function getIsoWeekInfo(date = new Date()) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7)
  return { year: target.getUTCFullYear(), week: weekNo }
}

function cleanupOldBackupFiles(referenceDate = new Date()) {
  const backupDir = getBackupDir()
  if (!fs.existsSync(backupDir)) return

  const oneYearAgo = new Date(referenceDate)
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const eightWeeksAgo = new Date(referenceDate)
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - (8 * 7))

  const ninetyDaysAgo = new Date(referenceDate)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const backupFiles = fs.readdirSync(backupDir).filter(f => f.startsWith('dentastock-') && f.endsWith('.db.gz'))
  for (const file of backupFiles) {
    const filePath = path.join(backupDir, file)
    const fileDate = fs.statSync(filePath).mtime
    const isMonthly = file.startsWith('dentastock-monthly-')
    const isWeekly = file.startsWith('dentastock-weekly-')
    const isRestorePoint = file.startsWith('dentastock-before-')

    if ((isMonthly && fileDate < oneYearAgo) || (isWeekly && fileDate < eightWeeksAgo) || (isRestorePoint && fileDate < ninetyDaysAgo)) {
      fs.unlinkSync(filePath)
      console.log(`[DentaStock] Ancien backup supprime: ${file}`)
    }
  }
}

function createCompressedBackup(backupName) {
  const backupDir = ensureDirectory(getBackupDir())
  const backupPath = path.join(backupDir, backupName)

  saveDatabase()
  const dbBuffer = fs.readFileSync(dbPath)
  const compressed = zlib.gzipSync(dbBuffer, { level: 9 })
  fs.writeFileSync(backupPath, compressed)

  return { backupPath, compressedSize: compressed.length }
}

function runWeeklyBackupIfNeeded(force = false) {
  if (!db || !dbPath) return null

  const lastBackup = getLastWeeklyBackupDate()
  const now = new Date()

  if (!force && lastBackup) {
    const daysSince = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 7) return null
  }

  console.log('[DentaStock] Lancement de la sauvegarde hebdomadaire...')

  try {
    const isoWeek = getIsoWeekInfo(now)
    const weekLabel = `${isoWeek.year}-W${String(isoWeek.week).padStart(2, '0')}`
    const backupName = `dentastock-weekly-${weekLabel}.db.gz`
    const { backupPath, compressedSize } = createCompressedBackup(backupName)

    console.log(`[DentaStock] Backup hebdo cree: ${backupPath} (${(compressedSize / 1024).toFixed(0)} Ko)`)

    cleanupOldBackupFiles(now)
    setLastWeeklyBackupDate()
    return backupPath
  } catch (err) {
    console.error('[DentaStock] Erreur sauvegarde hebdomadaire:', err.message)
    return null
  }
}

function runMonthlyBackupIfNeeded(force = false) {
  if (!db || !dbPath) return null

  const lastBackup = getLastMonthlyBackupDate()
  const now = new Date()

  if (!force && lastBackup) {
    const daysSince = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSince < 30) return
  }

  console.log('[DentaStock] Lancement de la sauvegarde mensuelle...')

  try {
    const timestamp = now.toISOString().slice(0, 7) // YYYY-MM
    const backupName = `dentastock-monthly-${timestamp}.db.gz`
    const { backupPath, compressedSize } = createCompressedBackup(backupName)

    console.log(`[DentaStock] Backup cree: ${backupPath} (${(compressedSize / 1024).toFixed(0)} Ko)`)

    cleanupOldBackupFiles(now)

    setLastMonthlyBackupDate()
    console.log('[DentaStock] Sauvegarde mensuelle terminee.')
    return backupPath
  } catch (err) {
    console.error('[DentaStock] Erreur sauvegarde mensuelle:', err.message)
    return null
  }
}

function createAutomaticRestorePoint(prefix, date = new Date()) {
  const backupName = `dentastock-before-${prefix}-${createBackupTimestamp(date)}.db.gz`
  const backupPath = createCompressedBackup(backupName).backupPath
  cleanupOldBackupFiles(date)
  return backupPath
}

function getIntegrityMetaPath() {
  return path.join(getBackupDir(), 'last-integrity-check.json')
}

function readLastIntegrityCheck() {
  const metaPath = getIntegrityMetaPath()
  if (!fs.existsSync(metaPath)) return null

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeLastIntegrityCheck(payload) {
  const backupDir = ensureDirectory(getBackupDir())
  fs.writeFileSync(path.join(backupDir, 'last-integrity-check.json'), JSON.stringify(payload, null, 2), 'utf-8')
}

function normalizeProfileRole(role) {
  const normalized = String(role || 'EQUIPE').trim().toUpperCase()
  return VALID_PROFILE_ROLES.includes(normalized) ? normalized : 'EQUIPE'
}

function normalizeOperatorStatus(status) {
  const normalized = String(status || 'ACTIF').trim().toUpperCase()
  return VALID_OPERATOR_STATUS.includes(normalized) ? normalized : 'ACTIF'
}

function normalizeReferenceCode(value, fallback = '') {
  const digits = String(value ?? fallback).replace(/\D/g, '')
  if (!digits) return ''
  return String(Number(digits))
}

function createPinHash(pin) {
  return crypto.createHash('sha256').update(`dentastock-pin:${String(pin || '')}`).digest('hex')
}

function normalizePin(pin) {
  const digits = String(pin || '').replace(/\D/g, '')
  return digits.length === 4 ? digits : ''
}

function verifyPin(pin, hash) {
  const normalizedPin = normalizePin(pin)
  if (!normalizedPin || !hash) return false
  return createPinHash(normalizedPin) === hash
}

function defaultPermissionsForRole(role = 'EQUIPE') {
  const normalizedRole = normalizeProfileRole(role)
  if (normalizedRole === 'ADMIN') {
    return Object.fromEntries(OPERATOR_PERMISSION_KEYS.map(key => [key, true]))
  }
  if (normalizedRole === 'LECTURE') {
    return Object.fromEntries(OPERATOR_PERMISSION_KEYS.map(key => [key, false]))
  }

  return {
    commandes_generate: true,
    commandes_edit: true,
    receptions_edit: true,
    stock_edit: true,
    fournisseurs_edit: false,
    produits_edit: false,
    praticiens_edit: false,
    utilisateurs_edit: false,
    parametres_edit: false,
    sauvegardes_edit: false,
  }
}

function normalizePermissions(input, role = 'EQUIPE') {
  const defaults = defaultPermissionsForRole(role)
  const source = input && typeof input === 'object' ? input : {}
  return OPERATOR_PERMISSION_KEYS.reduce((accumulator, key) => {
    accumulator[key] = source[key] === undefined ? Boolean(defaults[key]) : Boolean(source[key])
    return accumulator
  }, {})
}

function parsePermissions(rawPermissions, role = 'EQUIPE') {
  if (!rawPermissions) return defaultPermissionsForRole(role)

  try {
    return normalizePermissions(JSON.parse(rawPermissions), role)
  } catch {
    return defaultPermissionsForRole(role)
  }
}

function serializePermissions(permissions, role = 'EQUIPE') {
  return JSON.stringify(normalizePermissions(permissions, role))
}

function sanitizeOperatorRow(row = null) {
  if (!row) return null

  const nom = String(row.nom || '').trim()
  const prenom = String(row.prenom || '').trim()
  return {
    id: Number(row.id || 0),
    nom,
    prenom,
    nom_complet: `${prenom ? `${prenom} ` : ''}${nom}`.trim(),
    reference_code: normalizeReferenceCode(row.reference_code, row.id),
    role: normalizeProfileRole(row.role),
    statut: normalizeOperatorStatus(row.statut),
    permissions: parsePermissions(row.permissions, row.role),
    hasPin: Boolean(row.pin_hash),
    last_login_at: row.last_login_at || null,
    created_at: row.created_at || null,
  }
}

function ensureDefaultProfiles() {
  const total = Number(dbGet('SELECT COUNT(*) AS c FROM profils')?.c || 0)

  if (total === 0) {
    dbRun(`INSERT INTO profils (
      nom, prenom, reference_code, role, actif, statut, permissions, pin_hash
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`, [
      'Administrateur',
      '',
      '1',
      'ADMIN',
      'ACTIF',
      serializePermissions(defaultPermissionsForRole('ADMIN'), 'ADMIN'),
      createPinHash('1111'),
    ])
    return
  }

  const rows = dbAll('SELECT * FROM profils ORDER BY id ASC')
  const usedReferenceCodes = new Set()

  rows.forEach((row, index) => {
    const nextRole = normalizeProfileRole(row.role)
    const nextReferenceCode = normalizeReferenceCode(row.reference_code, row.id || index + 1)
    let uniqueReferenceCode = nextReferenceCode || String(index + 1)
    while (usedReferenceCodes.has(uniqueReferenceCode)) {
      uniqueReferenceCode = String(Number(uniqueReferenceCode) + 1)
    }
    usedReferenceCodes.add(uniqueReferenceCode)

    const updates = []
    const params = []

    if ((row.prenom || null) === null) {
      updates.push('prenom = ?')
      params.push('')
    }
    if ((row.reference_code || '') !== uniqueReferenceCode) {
      updates.push('reference_code = ?')
      params.push(uniqueReferenceCode)
    }
    if (normalizeOperatorStatus(row.statut) !== String(row.statut || '').trim().toUpperCase()) {
      updates.push('statut = ?')
      params.push(normalizeOperatorStatus(row.statut))
    }
    if (!row.permissions) {
      updates.push('permissions = ?')
      params.push(serializePermissions(defaultPermissionsForRole(nextRole), nextRole))
    }
    if (!row.pin_hash) {
      updates.push('pin_hash = ?')
      params.push(createPinHash('1111'))
    }
    if ((row.role || '') !== nextRole) {
      updates.push('role = ?')
      params.push(nextRole)
    }

    if (updates.length > 0) {
      params.push(row.id)
      dbRun(`UPDATE profils SET ${updates.join(', ')} WHERE id = ?`, params)
    }
  })
}

function applyInitialAdministratorPin(pin) {
  const normalizedPin = normalizePin(pin)
  if (!normalizedPin) {
    throw new Error('Le code PIN administrateur doit contenir exactement 4 chiffres.')
  }

  ensureDefaultProfiles()

  const administrator = dbGet(`SELECT * FROM profils
    WHERE role = 'ADMIN'
    ORDER BY CAST(COALESCE(reference_code, id) AS INTEGER) ASC, id ASC
    LIMIT 1`)

  if (!administrator) {
    throw new Error('Impossible d initialiser le compte administrateur.')
  }

  dbRun(`UPDATE profils
    SET reference_code = ?,
        role = 'ADMIN',
        statut = 'ACTIF',
        permissions = ?,
        pin_hash = ?
    WHERE id = ?`, [
    normalizeReferenceCode(administrator.reference_code, 1) || '1',
    serializePermissions(defaultPermissionsForRole('ADMIN'), 'ADMIN'),
    createPinHash(normalizedPin),
    administrator.id,
  ])

  saveDatabase()
  return sanitizeOperatorRow(dbGet('SELECT * FROM profils WHERE id = ?', [administrator.id]))
}

function getOperatorById(operatorId) {
  if (!operatorId) return null
  return dbGet('SELECT * FROM profils WHERE id = ?', [operatorId]) || null
}

function getCurrentOperatorRow() {
  ensureDefaultProfiles()
  if (!currentSession.operatorId) return null
  const row = getOperatorById(currentSession.operatorId)
  if (!row || normalizeOperatorStatus(row.statut) !== 'ACTIF') return null
  return row
}

function getActiveProfileRow() {
  return getCurrentOperatorRow()
}

function requireAuthenticatedOperator(permission = null) {
  const operator = getCurrentOperatorRow()
  if (!operator) {
    throw new Error('Aucun operateur connecte. Connectez-vous avec votre numero de reference et votre code PIN.')
  }

  if (normalizeOperatorStatus(operator.statut) !== 'ACTIF') {
    throw new Error('Cet operateur est inactif et ne peut pas utiliser DentaStock.')
  }

  if (permission) {
    const permissions = parsePermissions(operator.permissions, operator.role)
    if (!permissions[permission]) {
      throw new Error('Vous n avez pas le droit operateur necessaire pour cette action.')
    }
  }

  return operator
}

function getSessionStatus() {
  const operator = sanitizeOperatorRow(getCurrentOperatorRow())
  return {
    authenticated: Boolean(operator),
    workstation: os.hostname(),
    loginAt: currentSession.loginAt,
    operator,
  }
}

function getAuditActor() {
  const activeProfile = getCurrentOperatorRow()
  return {
    actorProfileId: activeProfile?.id || null,
    actorName: activeProfile ? `${activeProfile.prenom ? `${activeProfile.prenom} ` : ''}${activeProfile.nom}`.trim() : 'Systeme',
    actorRole: activeProfile?.role || 'SYSTEM',
    workstation: os.hostname(),
  }
}

function canPersistOperatorSession() {
  if (setupConfig?.mode !== 'client') return true
  const connectionStatus = getClientConnectionStatus()
  return !connectionStatus.readOnly
}

function stringifyAuditDetails(details) {
  if (!details) return null
  if (typeof details === 'string') return details

  try {
    return JSON.stringify(details)
  } catch {
    return String(details)
  }
}

function logAuditEntry({
  action,
  module,
  targetType = null,
  targetId = null,
  targetLabel = null,
  summary,
  details = null,
}) {
  const actor = getAuditActor()
  dbRun(`INSERT INTO audit_log (
    action, module, target_type, target_id, target_label, summary, details,
    actor_profile_id, actor_name, actor_role, workstation
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    action,
    module,
    targetType,
    targetId,
    targetLabel,
    summary,
    stringifyAuditDetails(details),
    actor.actorProfileId,
    actor.actorName,
    actor.actorRole,
    actor.workstation,
  ])
}

function listBackupFiles() {
  const backupDir = getBackupDir()
  if (!fs.existsSync(backupDir)) return []

  return fs.readdirSync(backupDir)
    .filter(name => name.startsWith('dentastock-') && name.endsWith('.db.gz'))
    .map(name => {
      const stats = fs.statSync(path.join(backupDir, name))
      let type = 'manual'
      if (name.startsWith('dentastock-weekly-')) type = 'weekly'
      else if (name.startsWith('dentastock-monthly-')) type = 'monthly'
      else if (name.startsWith('dentastock-before-')) type = 'restore-point'

      return {
        name,
        type,
        size: stats.size,
        date: stats.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

function getLatestAutoBackupInfo(referenceDate = new Date()) {
  const candidates = [getLastWeeklyBackupDate(), getLastMonthlyBackupDate()].filter(Boolean)
  if (candidates.length === 0) {
    return {
      latestAutoBackup: null,
      autoBackupDelayDays: null,
      autoBackupWarningLevel: 'red',
      autoBackupOverdue: true,
    }
  }

  const latest = candidates.sort((a, b) => b.getTime() - a.getTime())[0]
  const delayDays = Math.floor((referenceDate.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24))

  return {
    latestAutoBackup: latest.toISOString(),
    autoBackupDelayDays: delayDays,
    autoBackupWarningLevel: delayDays > 30 ? 'red' : delayDays > 14 ? 'amber' : 'green',
    autoBackupOverdue: delayDays > 14,
  }
}

function verifyBackupIntegrity(backupName) {
  const backups = listBackupFiles()
  const selectedBackup = backupName
    ? backups.find(item => item.name === backupName)
    : backups.find(item => item.type === 'weekly' || item.type === 'monthly') || backups[0]

  if (!selectedBackup) {
    throw new Error('Aucune sauvegarde disponible a verifier.')
  }

  const backupPath = path.join(getBackupDir(), selectedBackup.name)
  const compressed = fs.readFileSync(backupPath)
  const decompressed = zlib.gunzipSync(compressed)

  let integrityResult = null
  try {
    const testDb = new SQL.Database(decompressed)
    const result = testDb.exec('PRAGMA integrity_check')
    testDb.close()
    const rows = result?.[0]?.values?.map(row => String(row[0])) || []
    integrityResult = rows.length === 0 ? ['ok'] : rows
  } catch (err) {
    integrityResult = [err.message || 'Erreur inconnue lors du controle.']
  }

  const ok = integrityResult.length === 1 && integrityResult[0].toLowerCase() === 'ok'
  const payload = {
    backupName: selectedBackup.name,
    checkedAt: new Date().toISOString(),
    ok,
    issues: ok ? [] : integrityResult,
  }

  writeLastIntegrityCheck(payload)

  return payload
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
  return path.join(getDataRoot(), 'data', DB_FILENAME)
}

function getDefaultDocumentsRoot() {
  return path.join(getDataRoot(), 'data', 'documents')
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

  if (setupConfig?.mode === 'client') {
    syncClientConnectionState({ syncReplica: false, allowSwitch: true })
  }

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

async function withWriteTransaction(work, options = {}) {
  if (setupConfig?.mode === 'client') {
    const connectionStatus = syncClientConnectionState({ syncReplica: false, allowSwitch: true })
    if (connectionStatus.readOnly) {
      throw new Error('Le serveur DentaStock est indisponible. Ce poste reste ouvert en lecture seule sur la copie locale de secours. Reconnectez le serveur ou reconfigurez ce poste en mode serveur.')
    }
  }

  if (!options.skipSession) {
    requireAuthenticatedOperator(options.permission || null)
  }

  if (!options.skipRoleCheck) {
    const activeProfile = getCurrentOperatorRow()
    if (activeProfile?.role === 'LECTURE') {
      throw new Error('Cet operateur est en lecture seule. Connectez-vous avec un operateur equipe ou administrateur pour modifier les donnees.')
    }
  }

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
    'profils', 'audit_log',
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

function getCommandeAdvisorRows() {
  const produits = dbAll(`SELECT p.*, f.nom AS fournisseur_nom
    FROM produits p
    LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
    WHERE p.archived = 0
    ORDER BY p.nom`)

  const pendingRows = dbAll(`
    SELECT ci.produit_id,
      SUM(MAX(ci.quantite - COALESCE(rec.recu, 0), 0)) AS quantite_en_attente
    FROM commande_items ci
    JOIN commandes c ON c.id = ci.commande_id
    LEFT JOIN (
      SELECT r.commande_id, ri.produit_id, SUM(ri.quantite) AS recu
      FROM reception_items ri
      JOIN receptions r ON r.id = ri.reception_id
      GROUP BY r.commande_id, ri.produit_id
    ) rec ON rec.commande_id = ci.commande_id AND rec.produit_id = ci.produit_id
    WHERE c.statut IN ('EN_ATTENTE', 'PARTIELLE')
    GROUP BY ci.produit_id
  `)

  const consumptionRows = dbAll(`
    SELECT ui.produit_id,
      SUM(ui.quantite) AS total_consomme,
      COUNT(DISTINCT substr(u.date, 1, 7)) AS nb_mois
    FROM utilisation_items ui
    JOIN utilisations u ON u.id = ui.utilisation_id
    WHERE u.date >= date('now', '-90 days')
    GROUP BY ui.produit_id
  `)

  const lastPriceRows = dbAll(`
    SELECT ph.produit_id, ph.prix_unitaire, ph.date
    FROM prix_historique ph
    JOIN (
      SELECT produit_id, MAX(id) AS max_id
      FROM prix_historique
      GROUP BY produit_id
    ) latest ON latest.max_id = ph.id
  `)

  const leadTimeRows = dbAll(`
    SELECT c.fournisseur_id, AVG(julianday(r.date) - julianday(c.date_commande)) AS avg_delai
    FROM commandes c
    JOIN receptions r ON r.commande_id = c.id
    WHERE c.fournisseur_id IS NOT NULL
      AND c.date_commande IS NOT NULL
      AND r.date >= date('now', '-6 months')
    GROUP BY c.fournisseur_id
  `)

  const pendingMap = new Map(pendingRows.map(row => [Number(row.produit_id || 0), Number(row.quantite_en_attente || 0)]))
  const consumptionMap = new Map(consumptionRows.map(row => [Number(row.produit_id || 0), row]))
  const lastPriceMap = new Map(lastPriceRows.map(row => [Number(row.produit_id || 0), row]))
  const leadTimeMap = new Map(leadTimeRows.map(row => [Number(row.fournisseur_id || 0), Number(row.avg_delai || 14)]))

  return produits
    .map(produit => {
      const produitId = Number(produit.id || 0)
      const stockActuel = Number(produit.stock_actuel || 0)
      const stockMinimum = Number(produit.stock_minimum || 0)
      const quantiteEnAttente = Number(pendingMap.get(produitId) || 0)
      const consumption = consumptionMap.get(produitId)
      const nbMois = Math.max(Number(consumption?.nb_mois || 0), 1)
      const moyenneMensuelle = consumption ? Number(consumption.total_consomme || 0) / nbMois : 0
      const delaiLivraisonJours = Math.max(7, Math.round(Number(leadTimeMap.get(Number(produit.fournisseur_id || 0)) || 14)))
      const couvertureSecurite = moyenneMensuelle > 0 ? Math.ceil((moyenneMensuelle / 30) * delaiLivraisonJours) : 0
      const stockCible = Math.max(
        stockMinimum > 0 ? stockMinimum * 2 : 0,
        stockMinimum + couvertureSecurite,
        stockMinimum > 0 ? stockMinimum + 1 : 1
      )
      const quantiteMinimum = Math.max(0, Math.ceil(stockMinimum - stockActuel - quantiteEnAttente))
      const quantiteConseillee = Math.max(0, Math.ceil(stockCible - stockActuel - quantiteEnAttente))
      const quantiteACommander = Math.max(quantiteMinimum, quantiteConseillee)
      const couvertureJours = moyenneMensuelle > 0
        ? Math.floor((stockActuel + quantiteEnAttente) / (moyenneMensuelle / 30))
        : null
      const lastPrice = lastPriceMap.get(produitId)
      const prixDernier = Number(lastPrice?.prix_unitaire || 0)
      const prixReference = Number(produit.prix_unitaire || 0) || prixDernier
      const variationPrixPct = prixDernier > 0 && prixReference > 0
        ? Math.round(((prixReference - prixDernier) / prixDernier) * 100)
        : null

      return {
        ...produit,
        quantite_en_attente: quantiteEnAttente,
        quantite_minimum: quantiteMinimum,
        quantite_conseillee: quantiteConseillee,
        quantite_a_commander: quantiteACommander,
        moyenne_mensuelle: Math.round(moyenneMensuelle * 10) / 10,
        couverture_jours: Number.isFinite(couvertureJours) ? couvertureJours : null,
        delai_livraison_jours: delaiLivraisonJours,
        prix_dernier: prixDernier || null,
        prix_reference: prixReference || 0,
        variation_prix_pct: variationPrixPct,
        montant_estime: quantiteACommander * prixReference,
      }
    })
    .filter(produit => produit.quantite_a_commander > 0)
    .sort((left, right) => {
      const leftGap = (Number(left.stock_actuel || 0) + Number(left.quantite_en_attente || 0)) - Number(left.stock_minimum || 0)
      const rightGap = (Number(right.stock_actuel || 0) + Number(right.quantite_en_attente || 0)) - Number(right.stock_minimum || 0)
      if (leftGap !== rightGap) return leftGap - rightGap

      const leftCover = Number.isFinite(left.couverture_jours) ? left.couverture_jours : 9999
      const rightCover = Number.isFinite(right.couverture_jours) ? right.couverture_jours : 9999
      return leftCover - rightCover
    })
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

  db.run(`CREATE TABLE IF NOT EXISTS profils (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT DEFAULT '',
    reference_code TEXT,
    role TEXT NOT NULL DEFAULT 'EQUIPE',
    actif INTEGER NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF',
    permissions TEXT,
    pin_hash TEXT,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    target_label TEXT,
    summary TEXT NOT NULL,
    details TEXT,
    actor_profile_id INTEGER REFERENCES profils(id),
    actor_name TEXT,
    actor_role TEXT,
    workstation TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  ensureColumn('fournisseurs', 'contact_commercial', 'TEXT')
  ensureColumn('receptions', 'commande_id', 'INTEGER')
  ensureColumn('profils', 'prenom', "TEXT DEFAULT ''")
  ensureColumn('profils', 'reference_code', 'TEXT')
  ensureColumn('profils', 'statut', "TEXT DEFAULT 'ACTIF'")
  ensureColumn('profils', 'permissions', 'TEXT')
  ensureColumn('profils', 'pin_hash', 'TEXT')
  ensureColumn('profils', 'last_login_at', 'DATETIME')

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
  db.run('CREATE INDEX IF NOT EXISTS idx_profils_actif ON profils(actif)')
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_profils_reference_code ON profils(reference_code)')
  db.run('CREATE INDEX IF NOT EXISTS idx_profils_statut ON profils(statut)')
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)')
  db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module)')

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

  ensureDefaultProfiles()
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

// Mises a jour
safeHandle('updates:check', async () => {
  try {
    const autoUpdate = require('./auto-update')
    const result = await autoUpdate.checkNow()
    return { ok: true, ...autoUpdate.getStatus(), updateInfo: result?.updateInfo || null }
  } catch (err) {
    return { ok: false, error: err.message || 'Erreur de verification' }
  }
})

safeHandle('updates:status', () => {
  try {
    const autoUpdate = require('./auto-update')
    return autoUpdate.getStatus()
  } catch {
    return { state: 'idle', message: '', currentVersion: app.getVersion() }
  }
})

safeHandle('updates:download', async () => {
  try {
    const autoUpdate = require('./auto-update')
    await autoUpdate.downloadNow()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

safeHandle('updates:install', () => {
  try {
    const autoUpdate = require('./auto-update')
    autoUpdate.installNow()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// Config
safeHandle('config:get', (_, cle) => {
  const row = dbGet('SELECT valeur FROM config WHERE cle = ?', [cle])
  return row ? row.valeur : null
})

safeHandle('config:set', async (_, cle, valeur) => {
  await withWriteTransaction(() => {
    dbRun('INSERT OR REPLACE INTO config (cle, valeur) VALUES (?, ?)', [cle, valeur])
  }, { permission: 'parametres_edit' })
})

// Profils
safeHandle('profiles:list', () => {
  ensureDefaultProfiles()
  return dbAll(`SELECT * FROM profils
    ORDER BY CAST(COALESCE(reference_code, id) AS INTEGER) ASC, nom COLLATE NOCASE ASC, prenom COLLATE NOCASE ASC`)
    .map(row => sanitizeOperatorRow(row))
})

safeHandle('profiles:getActive', () => {
  return sanitizeOperatorRow(getCurrentOperatorRow())
})

safeHandle('profiles:add', async (_, data) => {
  return withWriteTransaction(() => {
    const nom = String(data?.nom || '').trim()
    if (!nom) throw new Error('Le nom de l operateur est obligatoire.')

    const prenom = String(data?.prenom || '').trim()
    const role = normalizeProfileRole(data?.role)
    const statut = normalizeOperatorStatus(data?.statut)
    const referenceCode = normalizeReferenceCode(data?.reference_code)
    const pin = normalizePin(data?.pin)

    if (!referenceCode) throw new Error('Le numero de reference est obligatoire.')
    if (!pin) throw new Error('Le code PIN doit contenir exactement 4 chiffres.')

    const duplicate = dbGet('SELECT id FROM profils WHERE reference_code = ?', [referenceCode])
    if (duplicate) throw new Error('Ce numero de reference est deja utilise.')

    const permissions = normalizePermissions(data?.permissions, role)

    const profileId = dbInsert(`INSERT INTO profils (
      nom, prenom, reference_code, role, actif, statut, permissions, pin_hash
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`, [
      nom,
      prenom,
      referenceCode,
      role,
      statut,
      serializePermissions(permissions, role),
      createPinHash(pin),
    ])

    logAuditEntry({
      action: 'CREATE',
      module: 'OPERATEURS',
      targetType: 'operateur',
      targetId: profileId,
      targetLabel: `${prenom ? `${prenom} ` : ''}${nom}`.trim(),
      summary: `Operateur "${prenom ? `${prenom} ` : ''}${nom}" ajoute.`,
      details: `Ref ${referenceCode} - role ${role} - statut ${statut}.`,
    })
    return profileId
  }, { permission: 'utilisateurs_edit' })
})

safeHandle('profiles:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM profils WHERE id = ?', [id])
    if (!current) throw new Error('Operateur introuvable.')

    const nom = String(data?.nom || '').trim()
    const prenom = String(data?.prenom || '').trim()
    if (!nom) throw new Error('Le nom de l operateur est obligatoire.')

    const role = normalizeProfileRole(data?.role)
    const statut = normalizeOperatorStatus(data?.statut)
    const referenceCode = normalizeReferenceCode(data?.reference_code, current.reference_code || current.id)
    if (!referenceCode) throw new Error('Le numero de reference est obligatoire.')

    const duplicate = dbGet('SELECT id FROM profils WHERE reference_code = ? AND id <> ?', [referenceCode, id])
    if (duplicate) throw new Error('Ce numero de reference est deja utilise.')

    const permissions = normalizePermissions(data?.permissions, role)
    const nextPinHash = data?.pin ? createPinHash(normalizePin(data.pin)) : current.pin_hash
    if (data?.pin && !normalizePin(data.pin)) {
      throw new Error('Le code PIN doit contenir exactement 4 chiffres.')
    }

    dbRun(`UPDATE profils
      SET nom = ?, prenom = ?, reference_code = ?, role = ?, statut = ?, permissions = ?, pin_hash = ?
      WHERE id = ?`, [
      nom,
      prenom,
      referenceCode,
      role,
      statut,
      serializePermissions(permissions, role),
      nextPinHash,
      id,
    ])

    if (Number(currentSession.operatorId || 0) === Number(id) && statut !== 'ACTIF') {
      currentSession = { operatorId: null, loginAt: null }
    }

    const changes = []
    if (current.nom !== nom || (current.prenom || '') !== prenom) changes.push(`Operateur: ${current.prenom ? `${current.prenom} ` : ''}${current.nom} -> ${prenom ? `${prenom} ` : ''}${nom}`)
    if (normalizeReferenceCode(current.reference_code, current.id) !== referenceCode) changes.push(`Ref: ${normalizeReferenceCode(current.reference_code, current.id)} -> ${referenceCode}`)
    if (current.role !== role) changes.push(`Role: ${current.role} -> ${role}`)
    if (normalizeOperatorStatus(current.statut) !== statut) changes.push(`Statut: ${normalizeOperatorStatus(current.statut)} -> ${statut}`)
    if (data?.pin) changes.push('PIN reinitialise')

    logAuditEntry({
      action: 'UPDATE',
      module: 'OPERATEURS',
      targetType: 'operateur',
      targetId: id,
      targetLabel: `${prenom ? `${prenom} ` : ''}${nom}`.trim(),
      summary: `Operateur "${prenom ? `${prenom} ` : ''}${nom}" mis a jour.`,
      details: changes.join(' - ') || 'Fiche operateur ajustee.',
    })
  }, { permission: 'utilisateurs_edit' })
})

safeHandle('profiles:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM profils WHERE id = ?', [id])
    if (!current) throw new Error('Operateur introuvable.')

    const total = Number(dbGet('SELECT COUNT(*) AS c FROM profils')?.c || 0)
    if (total <= 1) throw new Error('Il faut conserver au moins un operateur.')

    dbRun('DELETE FROM profils WHERE id = ?', [id])
    if (Number(currentSession.operatorId || 0) === Number(id)) {
      currentSession = { operatorId: null, loginAt: null }
    }

    logAuditEntry({
      action: 'DELETE',
      module: 'OPERATEURS',
      targetType: 'operateur',
      targetId: id,
      targetLabel: `${current.prenom ? `${current.prenom} ` : ''}${current.nom}`.trim(),
      summary: `Operateur "${current.prenom ? `${current.prenom} ` : ''}${current.nom}" supprime.`,
      details: `Ref ${normalizeReferenceCode(current.reference_code, current.id)} - role ${current.role}.`,
    })
  }, { permission: 'utilisateurs_edit' })
})

safeHandle('profiles:setActive', async (_, id) => {
  throw new Error('L operateur actif est maintenant gere par la connexion operateur. Utilisez la connexion avec code PIN.')
})

// Session operateur
safeHandle('auth:listOperators', () => {
  ensureDefaultProfiles()
  return dbAll(`SELECT * FROM profils
    WHERE statut = 'ACTIF'
    ORDER BY CAST(reference_code AS INTEGER) ASC, nom COLLATE NOCASE ASC`)
    .map(row => {
      const operator = sanitizeOperatorRow(row)
      return {
        id: operator.id,
        nom: operator.nom,
        prenom: operator.prenom,
        nom_complet: operator.nom_complet,
        reference_code: operator.reference_code,
        role: operator.role,
      }
    })
})

safeHandle('auth:getSession', () => {
  return getSessionStatus()
})

safeHandle('auth:login', async (_, credentials = {}) => {
  const referenceCode = normalizeReferenceCode(credentials.reference_code)
  const pin = normalizePin(credentials.pin)

  if (!referenceCode) throw new Error('Le numero de reference est obligatoire.')
  if (!pin) throw new Error('Le code PIN doit contenir exactement 4 chiffres.')

  const operator = dbGet('SELECT * FROM profils WHERE reference_code = ?', [referenceCode])
  if (!operator || normalizeOperatorStatus(operator.statut) !== 'ACTIF') {
    throw new Error('Operateur introuvable ou inactif.')
  }

  if (!verifyPin(pin, operator.pin_hash)) {
    throw new Error('Code PIN incorrect.')
  }

  const nextSession = {
    operatorId: Number(operator.id),
    loginAt: new Date().toISOString(),
  }

  currentSession = nextSession

  if (canPersistOperatorSession()) {
    try {
      await withWriteTransaction(() => {
        dbRun(`UPDATE profils
          SET last_login_at = CURRENT_TIMESTAMP, actif = CASE WHEN id = ? THEN 1 ELSE 0 END`, [operator.id])
        logAuditEntry({
          action: 'LOGIN',
          module: 'OPERATEURS',
          targetType: 'operateur',
          targetId: operator.id,
          targetLabel: `${operator.prenom ? `${operator.prenom} ` : ''}${operator.nom}`.trim(),
          summary: `Connexion de ${operator.prenom ? `${operator.prenom} ` : ''}${operator.nom}.`,
          details: `Ref ${normalizeReferenceCode(operator.reference_code, operator.id)}.`,
        })
      }, { skipSession: true, skipRoleCheck: true })
    } catch (error) {
      currentSession = {
        operatorId: null,
        loginAt: null,
      }
      throw error
    }
  }

  return getSessionStatus()
})

safeHandle('auth:logout', async () => {
  const currentOperator = getCurrentOperatorRow()
  if (currentOperator && canPersistOperatorSession()) {
    try {
      await withWriteTransaction(() => {
        dbRun('UPDATE profils SET actif = 0')
        logAuditEntry({
          action: 'LOGOUT',
          module: 'OPERATEURS',
          targetType: 'operateur',
          targetId: currentOperator.id,
          targetLabel: `${currentOperator.prenom ? `${currentOperator.prenom} ` : ''}${currentOperator.nom}`.trim(),
          summary: `Deconnexion de ${currentOperator.prenom ? `${currentOperator.prenom} ` : ''}${currentOperator.nom}.`,
        })
      }, { skipRoleCheck: true })
    } catch (error) {
      console.error('[DentaStock] Impossible de persister la deconnexion operateur:', error.message)
    }
  }

  currentSession = {
    operatorId: null,
    loginAt: null,
  }
  return getSessionStatus()
})

// Journal d audit
safeHandle('audit:list', (_, filters = {}) => {
  const conditions = []
  const params = []
  const limit = Math.max(1, Math.min(Number(filters?.limit || 100), 500))

  if (filters?.module) {
    conditions.push('module = ?')
    params.push(String(filters.module).trim().toUpperCase())
  }

  if (filters?.search && String(filters.search).trim()) {
    const query = `%${String(filters.search).trim()}%`
    conditions.push('(summary LIKE ? OR COALESCE(target_label, \'\') LIKE ? OR COALESCE(actor_name, \'\') LIKE ? OR COALESCE(details, \'\') LIKE ?)')
    params.push(query, query, query, query)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return dbAll(`SELECT *
    FROM audit_log
    ${whereClause}
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ${limit}`, params)
})

// Storage
safeHandle('storage:getStatus', () => getStorageStatus())

safeHandle('storage:setRoot', async (_, rootPath) => {
  requireAuthenticatedOperator('parametres_edit')
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

safeHandle('setup:getDefaults', () => {
  const serverDataPath = getServerLocalDataPath()
  return {
    installDir: getInstallDir(),
    serverDataPath,
    serverDbPath: path.join(serverDataPath, DB_FILENAME),
    defaultAdminReference: '1',
  }
})

safeHandle('setup:configure', async (_, config) => {
  const { mode, dataPath, seedFromReplica } = config
  const initialAdminPin = normalizePin(config?.initialAdminPin)

  if (mode === 'server') {
    let localDataPath = getServerLocalDataPath()
    let targetDb = path.join(localDataPath, DB_FILENAME)
    let isNewServerDatabase = !fs.existsSync(targetDb) || fs.statSync(targetDb).size === 0

    if (seedFromReplica) {
      const promoted = promoteReplicaToServer()
      localDataPath = promoted.localDataPath
      targetDb = promoted.targetDb
      isNewServerDatabase = false
    } else {
      ensureDirectory(localDataPath)
      if (replicaInterval) {
        clearInterval(replicaInterval)
        replicaInterval = null
      }

      if (isNewServerDatabase && !initialAdminPin) {
        throw new Error('Veuillez definir le code PIN administrateur de depart avant de continuer.')
      }

      saveSetupConfig({ mode: 'server', dataPath: localDataPath })
    }

    await initDatabase(targetDb)
    if (!seedFromReplica && isNewServerDatabase) {
      applyInitialAdministratorPin(initialAdminPin)
    }
    return { success: true, mode: 'server', dataPath: localDataPath, promotedFromReplica: Boolean(seedFromReplica) }
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
  const lastBackup = getLastMonthlyBackupDate()
  const lastWeeklyBackup = getLastWeeklyBackupDate()
  const backupDir = getBackupDir()
  const backups = listBackupFiles()
  const backupHealth = getLatestAutoBackupInfo()
  const lastIntegrityCheck = readLastIntegrityCheck()

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

  const connectionStatus = setupConfig?.mode === 'client'
    ? getClientConnectionStatus()
    : {
        mode: setupConfig?.mode || null,
        readOnly: false,
        usingReplica: false,
        replicaAvailable: fs.existsSync(getReplicaDbPath()),
        activeDbPath: dbPath || null,
      }

  return {
    lastMonthlyBackup: lastBackup ? lastBackup.toISOString() : null,
    lastWeeklyBackup: lastWeeklyBackup ? lastWeeklyBackup.toISOString() : null,
    latestAutoBackup: backupHealth.latestAutoBackup,
    autoBackupDelayDays: backupHealth.autoBackupDelayDays,
    autoBackupWarningLevel: backupHealth.autoBackupWarningLevel,
    autoBackupOverdue: backupHealth.autoBackupOverdue,
    lastIntegrityCheck,
    backups,
    backupDir,
    replica: replicaInfo,
    serverReachable: setupConfig?.mode === 'client' ? isServerReachable() : null,
    connectionStatus,
  }
})

safeHandle('backup:runNow', async () => {
  requireAuthenticatedOperator('sauvegardes_edit')
  if (!db) throw new Error('Aucune base ouverte.')
  cleanupOldBackupFiles(new Date())
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `dentastock-manual-${timestamp}.db.gz`
  const { backupPath } = createCompressedBackup(backupName)
  return backupPath
})

safeHandle('backup:runAutoNow', async () => {
  requireAuthenticatedOperator('sauvegardes_edit')
  if (!db) throw new Error('Aucune base ouverte.')

  const weeklyPath = runWeeklyBackupIfNeeded(true)
  const now = new Date()
  const lastMonthly = getLastMonthlyBackupDate()
  const monthlyIsLate = !lastMonthly || ((now.getTime() - lastMonthly.getTime()) / (1000 * 60 * 60 * 24)) >= 30
  const monthlyPath = monthlyIsLate ? runMonthlyBackupIfNeeded(true) : null

  return {
    weekly: weeklyPath,
    monthly: monthlyPath,
  }
})

safeHandle('backup:verifyIntegrity', async (_, backupName) => {
  requireAuthenticatedOperator('sauvegardes_edit')
  if (!SQL) {
    const initSqlJs = require('sql.js')
    const wasmPath = app.isPackaged
      ? path.join(process.resourcesPath, 'sql-wasm.wasm')
      : undefined
    SQL = await initSqlJs(wasmPath ? { locateFile: () => wasmPath } : undefined)
  }

  return verifyBackupIntegrity(backupName || null)
})

safeHandle('backup:restore', async (_, backupName) => {
  requireAuthenticatedOperator('sauvegardes_edit')
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
  const safeCopy = fs.existsSync(dbPath)
    ? createAutomaticRestorePoint('restore')
    : null

  // Restaurer
  fs.writeFileSync(dbPath, decompressed)
  loadDatabaseFromFile(dbPath)
  ensureSchema()
  saveDatabase()

  return { restored: backupName, backup: safeCopy }
})

safeHandle('replica:syncNow', async () => {
  const status = syncClientConnectionState({ syncReplica: true, allowSwitch: true })
  return { success: Boolean(status.serverReachable), serverReachable: status.serverReachable, usingReplica: status.usingReplica }
})

safeHandle('server:getStatus', () => {
  return syncClientConnectionState({ syncReplica: false, allowSwitch: true })
})

safeHandle('server:retryConnection', () => {
  return syncClientConnectionState({ syncReplica: true, allowSwitch: true })
})

// Fournisseurs
safeHandle('fournisseurs:list', () => dbAll('SELECT * FROM fournisseurs WHERE archived = 0 ORDER BY nom'))

safeHandle('fournisseurs:listArchived', () => dbAll('SELECT * FROM fournisseurs WHERE archived = 1 ORDER BY nom'))

safeHandle('fournisseurs:archive', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM fournisseurs WHERE id = ?', [id])
    dbRun('UPDATE fournisseurs SET archived = 1 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'ARCHIVE',
        module: 'FOURNISSEURS',
        targetType: 'fournisseur',
        targetId: id,
        targetLabel: current.nom,
        summary: `Fournisseur "${current.nom}" archive.`,
      })
    }
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('fournisseurs:restore', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM fournisseurs WHERE id = ?', [id])
    dbRun('UPDATE fournisseurs SET archived = 0 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'RESTORE',
        module: 'FOURNISSEURS',
        targetType: 'fournisseur',
        targetId: id,
        targetLabel: current.nom,
        summary: `Fournisseur "${current.nom}" restaure.`,
      })
    }
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('fournisseurs:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM fournisseurs WHERE id = ?', [id])
    const linked = dbGet('SELECT COUNT(*) AS c FROM produits WHERE fournisseur_id = ?', [id])
    if (linked && linked.c > 0) {
      throw new Error('Ce fournisseur est lie a des produits existants et ne peut pas etre supprime definitivement.')
    }
    dbRun('DELETE FROM fournisseurs WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'DELETE',
        module: 'FOURNISSEURS',
        targetType: 'fournisseur',
        targetId: id,
        targetLabel: current.nom,
        summary: `Fournisseur "${current.nom}" supprime definitivement.`,
      })
    }
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('fournisseurs:add', async (_, data) => {
  return withWriteTransaction(() => {
    const fournisseurId = dbInsert(
      'INSERT INTO fournisseurs (nom, email, telephone, adresse, contact_commercial) VALUES (?, ?, ?, ?, ?)',
      [data.nom, data.email, data.telephone, data.adresse, data.contact_commercial]
    )
    logAuditEntry({
      action: 'CREATE',
      module: 'FOURNISSEURS',
      targetType: 'fournisseur',
      targetId: fournisseurId,
      targetLabel: data.nom,
      summary: `Fournisseur "${data.nom}" ajoute.`,
      details: data.contact_commercial ? `Contact: ${data.contact_commercial}.` : null,
    })
    return fournisseurId
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('fournisseurs:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM fournisseurs WHERE id = ?', [id])
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
    const changes = []
    if ((current?.nom || '') !== (data.nom || '')) changes.push(`Nom: ${current?.nom || '-'} -> ${data.nom || '-'}`)
    if ((current?.contact_commercial || '') !== (data.contact_commercial || '')) changes.push(`Contact: ${current?.contact_commercial || '-'} -> ${data.contact_commercial || '-'}`)
    if ((current?.telephone || '') !== (data.telephone || '')) changes.push(`Telephone: ${current?.telephone || '-'} -> ${data.telephone || '-'}`)
    logAuditEntry({
      action: 'UPDATE',
      module: 'FOURNISSEURS',
      targetType: 'fournisseur',
      targetId: id,
      targetLabel: data.nom,
      summary: `Fiche fournisseur "${data.nom}" mise a jour.`,
      details: changes.join(' - ') || 'Coordonnees fournisseur mises a jour.',
    })
  }, { permission: 'fournisseurs_edit' })
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
    const categoryId = dbInsert('INSERT INTO categories (nom, description) VALUES (?, ?)', [
      data.nom,
      data.description || null,
    ])
    logAuditEntry({
      action: 'CREATE',
      module: 'CATEGORIES',
      targetType: 'categorie',
      targetId: categoryId,
      targetLabel: data.nom,
      summary: `Categorie "${data.nom}" ajoutee.`,
      details: data.description || null,
    })
    return categoryId
  }, { permission: 'produits_edit' })
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

    logAuditEntry({
      action: 'UPDATE',
      module: 'CATEGORIES',
      targetType: 'categorie',
      targetId: id,
      targetLabel: data.nom,
      summary: `Categorie "${current.nom}" mise a jour.`,
      details: current.nom !== data.nom ? `Nom: ${current.nom} -> ${data.nom}` : (data.description || 'Description mise a jour.'),
    })
  }, { permission: 'produits_edit' })
})

safeHandle('categories:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM categories WHERE id = ?', [id])
    if (!current) {
      throw new Error('Categorie introuvable.')
    }

    dbRun('UPDATE produits SET categorie = NULL WHERE categorie = ?', [current.nom])
    dbRun('DELETE FROM categories WHERE id = ?', [id])
    logAuditEntry({
      action: 'DELETE',
      module: 'CATEGORIES',
      targetType: 'categorie',
      targetId: id,
      targetLabel: current.nom,
      summary: `Categorie "${current.nom}" supprimee.`,
      details: 'Les produits associes repassent en non classe.',
    })
  }, { permission: 'produits_edit' })
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
    const current = dbGet('SELECT * FROM produits WHERE id = ?', [id])
    dbRun('UPDATE produits SET archived = 1 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'ARCHIVE',
        module: 'PRODUITS',
        targetType: 'produit',
        targetId: id,
        targetLabel: current.nom,
        summary: `Produit "${current.nom}" archive.`,
      })
    }
  }, { permission: 'produits_edit' })
})

safeHandle('produits:restore', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM produits WHERE id = ?', [id])
    dbRun('UPDATE produits SET archived = 0 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'RESTORE',
        module: 'PRODUITS',
        targetType: 'produit',
        targetId: id,
        targetLabel: current.nom,
        summary: `Produit "${current.nom}" restaure.`,
      })
    }
  }, { permission: 'produits_edit' })
})

safeHandle('produits:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM produits WHERE id = ?', [id])
    const linked = dbGet('SELECT COUNT(*) AS c FROM commande_items WHERE produit_id = ?', [id])
    const linked2 = dbGet('SELECT COUNT(*) AS c FROM utilisation_items WHERE produit_id = ?', [id])
    if ((linked && linked.c > 0) || (linked2 && linked2.c > 0)) {
      throw new Error('Ce produit est lie a des commandes ou consommations et ne peut pas etre supprime definitivement. Archivez-le a la place.')
    }
    dbRun('DELETE FROM produits WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'DELETE',
        module: 'PRODUITS',
        targetType: 'produit',
        targetId: id,
        targetLabel: current.nom,
        summary: `Produit "${current.nom}" supprime definitivement.`,
      })
    }
  }, { permission: 'produits_edit' })
})

safeHandle('produits:add', async (_, data) => {
  return withWriteTransaction(() => {
    if (data.categorie) {
      dbRun('INSERT OR IGNORE INTO categories (nom) VALUES (?)', [data.categorie])
    }

    const produitId = dbInsert(`INSERT INTO produits (
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
    logAuditEntry({
      action: 'CREATE',
      module: 'PRODUITS',
      targetType: 'produit',
      targetId: produitId,
      targetLabel: data.nom,
      summary: `Produit "${data.nom}" ajoute au catalogue.`,
      details: `Stock initial: ${Number(data.stock_actuel || 0)} ${data.unite || 'unite'} - seuil: ${Number(data.stock_minimum || 0)}.`,
    })
    return produitId
  }, { permission: 'produits_edit' })
})

safeHandle('produits:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM produits WHERE id = ?', [id])
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
    const changes = []
    if ((current?.nom || '') !== (data.nom || '')) changes.push(`Nom: ${current?.nom || '-'} -> ${data.nom || '-'}`)
    if (Number(current?.stock_actuel || 0) !== Number(data.stock_actuel || 0)) changes.push(`Stock: ${Number(current?.stock_actuel || 0)} -> ${Number(data.stock_actuel || 0)}`)
    if (Number(current?.stock_minimum || 0) !== Number(data.stock_minimum || 0)) changes.push(`Seuil: ${Number(current?.stock_minimum || 0)} -> ${Number(data.stock_minimum || 0)}`)
    if ((current?.categorie || '') !== (data.categorie || '')) changes.push(`Categorie: ${current?.categorie || 'Non classe'} -> ${data.categorie || 'Non classe'}`)
    if (Number(current?.prix_unitaire || 0) !== Number(data.prix_unitaire || 0)) changes.push(`Prix HT: ${Number(current?.prix_unitaire || 0)} -> ${Number(data.prix_unitaire || 0)}`)
    logAuditEntry({
      action: 'UPDATE',
      module: 'PRODUITS',
      targetType: 'produit',
      targetId: id,
      targetLabel: data.nom,
      summary: `Fiche produit "${data.nom}" mise a jour.`,
      details: changes.join(' - ') || 'Ajustement de la fiche produit.',
    })
  }, { permission: 'produits_edit' })
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

    logAuditEntry({
      action: 'CREATE',
      module: 'COMMANDES',
      targetType: 'commande',
      targetId: commandeId,
      targetLabel: data.reference_commande || `Commande #${commandeId}`,
      summary: `Commande ${data.reference_commande || `#${commandeId}`} enregistree.`,
      details: `${(data.items || []).length} ligne(s) - fournisseur #${data.fournisseur_id || 'non renseigne'}.`,
    })
    return commandeId
  }, { permission: 'commandes_edit' })
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

    logAuditEntry({
      action: 'UPDATE',
      module: 'COMMANDES',
      targetType: 'commande',
      targetId: id,
      targetLabel: data.reference_commande || current.reference_commande || `Commande #${id}`,
      summary: `Commande ${data.reference_commande || current.reference_commande || `#${id}`} mise a jour.`,
      details: `Statut demande: ${requestedStatus} - ${(data.items || []).length} ligne(s).`,
    })
  }, { permission: 'commandes_edit' })
})

safeHandle('commandes:updateStatus', async (_, id, statut) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM commandes WHERE id = ?', [id])
    const nextStatus = normalizeCommandeStatus(statut)
    dbRun('UPDATE commandes SET statut = ? WHERE id = ?', [nextStatus, id])
    if (current) {
      logAuditEntry({
        action: 'STATUS',
        module: 'COMMANDES',
        targetType: 'commande',
        targetId: id,
        targetLabel: current.reference_commande || `Commande #${id}`,
        summary: `Statut de ${current.reference_commande || `commande #${id}`} passe a ${nextStatus}.`,
      })
    }
  }, { permission: 'commandes_edit' })
})

safeHandle('commandes:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM commandes WHERE id = ?', [id])
    // Supprimer les items de la commande puis la commande elle-meme
    dbRun('DELETE FROM commande_items WHERE commande_id = ?', [id])
    dbRun('DELETE FROM commandes WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'DELETE',
        module: 'COMMANDES',
        targetType: 'commande',
        targetId: id,
        targetLabel: current.reference_commande || `Commande #${id}`,
        summary: `Commande ${current.reference_commande || `#${id}`} supprimee.`,
      })
    }
  }, { permission: 'commandes_edit' })
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
    const touched = []
    for (const adj of adjustments) {
      if (adj.stock_reel !== undefined && adj.stock_reel !== null) {
        const produit = dbGet('SELECT nom, stock_actuel, unite FROM produits WHERE id = ?', [adj.produit_id])
        dbRun('UPDATE produits SET stock_actuel = ? WHERE id = ?', [adj.stock_reel, adj.produit_id])
        count++
        if (produit) {
          touched.push(`${produit.nom}: ${Number(produit.stock_actuel || 0)} -> ${Number(adj.stock_reel || 0)} ${produit.unite || ''}`.trim())
        }
      }
    }
    if (count > 0) {
      logAuditEntry({
        action: 'ADJUST',
        module: 'STOCK',
        targetType: 'inventaire',
        summary: `Inventaire ajuste sur ${count} produit(s).`,
        details: touched.slice(0, 6).join(' - '),
      })
    }
    return { adjusted: count }
  }, { permission: 'stock_edit' })
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

    logAuditEntry({
      action: 'CREATE',
      module: 'RETOURS',
      targetType: 'retour',
      targetId: retourId,
      targetLabel: `Retour #${retourId}`,
      summary: `Retour fournisseur #${retourId} enregistre.`,
      details: `${(data.items || []).length} ligne(s) - motif: ${data.motif || 'non renseigne'}.`,
    })
    return retourId
  }, { permission: 'receptions_edit' })
})

// Praticiens
safeHandle('praticiens:list', () => dbAll('SELECT * FROM praticiens WHERE archived = 0 ORDER BY nom'))

safeHandle('praticiens:listArchived', () => dbAll('SELECT * FROM praticiens WHERE archived = 1 ORDER BY nom'))

safeHandle('praticiens:archive', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM praticiens WHERE id = ?', [id])
    dbRun('UPDATE praticiens SET archived = 1 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'ARCHIVE',
        module: 'PRATICIENS',
        targetType: 'praticien',
        targetId: id,
        targetLabel: `${current.prenom ? `${current.prenom} ` : ''}${current.nom}`.trim(),
        summary: `Praticien "${current.prenom ? `${current.prenom} ` : ''}${current.nom}" archive.`,
      })
    }
  }, { permission: 'praticiens_edit' })
})

safeHandle('praticiens:restore', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM praticiens WHERE id = ?', [id])
    dbRun('UPDATE praticiens SET archived = 0 WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'RESTORE',
        module: 'PRATICIENS',
        targetType: 'praticien',
        targetId: id,
        targetLabel: `${current.prenom ? `${current.prenom} ` : ''}${current.nom}`.trim(),
        summary: `Praticien "${current.prenom ? `${current.prenom} ` : ''}${current.nom}" restaure.`,
      })
    }
  }, { permission: 'praticiens_edit' })
})

safeHandle('praticiens:add', async (_, data) => {
  return withWriteTransaction(() => {
    const praticienId = dbInsert('INSERT INTO praticiens (nom, prenom, role) VALUES (?, ?, ?)', [
      data.nom,
      data.prenom,
      data.role,
    ])
    logAuditEntry({
      action: 'CREATE',
      module: 'PRATICIENS',
      targetType: 'praticien',
      targetId: praticienId,
      targetLabel: `${data.prenom ? `${data.prenom} ` : ''}${data.nom}`.trim(),
      summary: `Praticien "${data.prenom ? `${data.prenom} ` : ''}${data.nom}" ajoute.`,
      details: `Role: ${data.role || 'praticien'}.`,
    })
    return praticienId
  }, { permission: 'praticiens_edit' })
})

safeHandle('praticiens:update', async (_, id, data) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM praticiens WHERE id = ?', [id])
    dbRun('UPDATE praticiens SET nom = ?, prenom = ?, role = ? WHERE id = ?', [
      data.nom, data.prenom, data.role, id,
    ])
    logAuditEntry({
      action: 'UPDATE',
      module: 'PRATICIENS',
      targetType: 'praticien',
      targetId: id,
      targetLabel: `${data.prenom ? `${data.prenom} ` : ''}${data.nom}`.trim(),
      summary: `Fiche praticien "${data.prenom ? `${data.prenom} ` : ''}${data.nom}" mise a jour.`,
      details: current?.role !== data.role ? `Role: ${current?.role || '-'} -> ${data.role || '-'}` : null,
    })
  }, { permission: 'praticiens_edit' })
})

safeHandle('praticiens:delete', async (_, id) => {
  await withWriteTransaction(() => {
    const current = dbGet('SELECT * FROM praticiens WHERE id = ?', [id])
    const linked = dbGet('SELECT COUNT(*) AS c FROM utilisations WHERE praticien_id = ?', [id])
    if (linked && linked.c > 0) {
      throw new Error('Ce praticien est lie a des consommations existantes et ne peut pas etre supprime definitivement. Archivez-le a la place.')
    }
    dbRun('DELETE FROM praticiens WHERE id = ?', [id])
    if (current) {
      logAuditEntry({
        action: 'DELETE',
        module: 'PRATICIENS',
        targetType: 'praticien',
        targetId: id,
        targetLabel: `${current.prenom ? `${current.prenom} ` : ''}${current.nom}`.trim(),
        summary: `Praticien "${current.prenom ? `${current.prenom} ` : ''}${current.nom}" supprime definitivement.`,
      })
    }
  }, { permission: 'praticiens_edit' })
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
      const receptionId = appendToReception(existingReceptionId, data)
      logAuditEntry({
        action: 'APPEND',
        module: 'RECEPTIONS',
        targetType: 'reception',
        targetId: receptionId,
        targetLabel: data.reference_bl || `Reception #${receptionId}`,
        summary: `Reception partielle ajoutee a ${data.reference_bl || `la reception #${receptionId}`}.`,
        details: `${(data.items || []).length} ligne(s) sur un passage supplementaire.`,
      })
      return receptionId
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

    logAuditEntry({
      action: 'CREATE',
      module: 'RECEPTIONS',
      targetType: 'reception',
      targetId: receptionId,
      targetLabel: data.reference_bl || `Reception #${receptionId}`,
      summary: `Reception ${data.reference_bl || `#${receptionId}`} enregistree.`,
      details: `${(data.items || []).length} ligne(s) - fournisseur #${data.fournisseur_id || 'non renseigne'}.`,
    })
    return receptionId
  }, { permission: 'receptions_edit' })
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

    logAuditEntry({
      action: 'UPDATE',
      module: 'RECEPTIONS',
      targetType: 'reception',
      targetId: id,
      targetLabel: data.reference_bl || current.reference_bl || `Reception #${id}`,
      summary: `Reception ${data.reference_bl || current.reference_bl || `#${id}`} mise a jour.`,
      details: `${(data.items || []).length} ligne(s) - ${passageCount > 1 ? 'reception multi-passages' : 'reception simple'}.`,
    })
  }, { permission: 'receptions_edit' })
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

    logAuditEntry({
      action: 'CREATE',
      module: 'CONSOMMATION',
      targetType: 'utilisation',
      targetId: utilisationId,
      targetLabel: data.type_soin || `Consommation #${utilisationId}`,
      summary: `Consommation ${data.type_soin || `#${utilisationId}`} enregistree.`,
      details: `${(data.items || []).length} ligne(s) - praticien #${data.praticien_id || 'non renseigne'}.`,
    })
    return utilisationId
  }, { permission: 'stock_edit' })
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
  }, { permission: 'receptions_edit' })
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
  requireAuthenticatedOperator('sauvegardes_edit')
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
  requireAuthenticatedOperator('sauvegardes_edit')
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
  const backupPath = fs.existsSync(dbPath)
    ? createAutomaticRestorePoint('import')
    : null

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

safeHandle('commandes:advisor', () => {
  return getCommandeAdvisorRows()
})

// --- Commande automatique ---
safeHandle('commandes:autoGenerate', async () => {
  requireAuthenticatedOperator('commandes_generate')
  const alertProducts = getCommandeAdvisorRows().filter(produit => produit.fournisseur_id && produit.quantite_a_commander > 0)

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
        const qte = Math.max(1, Number(p.quantite_a_commander || p.quantite_conseillee || 0))
        dbRun(`INSERT INTO commande_items (commande_id, produit_id, quantite, prix_unitaire)
          VALUES (?, ?, ?, ?)`, [commandeId, p.id, qte, p.prix_reference || p.prix_unitaire || 0])
      })

      logAuditEntry({
        action: 'CREATE',
        module: 'COMMANDES',
        targetType: 'commande',
        targetId: commandeId,
        targetLabel: ref,
        summary: `Commande automatique ${ref} generee.`,
        details: `${produits.length} produit(s) prepares pour le fournisseur #${fournisseurId}.`,
      })
      createdCommandes.push({ id: commandeId, reference: ref, fournisseur_id: Number(fournisseurId), nb_produits: produits.length })
    }
  }, { permission: 'commandes_generate' })

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
  if (!query || query.trim().length < 2) {
    return { produits: [], fournisseurs: [], praticiens: [], commandes: [] }
  }
  const q = `%${query.trim()}%`

  const produits = dbAll(`SELECT id, reference, nom, categorie, stock_actuel, stock_minimum, unite
    FROM produits WHERE archived = 0 AND (nom LIKE ? OR reference LIKE ? OR categorie LIKE ?)
    ORDER BY nom LIMIT 10`, [q, q, q])

  const fournisseurs = dbAll(`SELECT id, nom, contact_commercial, email
    FROM fournisseurs WHERE archived = 0 AND (nom LIKE ? OR contact_commercial LIKE ? OR email LIKE ?)
    ORDER BY nom LIMIT 5`, [q, q, q])

  const praticiens = dbAll(`SELECT id, nom, prenom, role
    FROM praticiens WHERE archived = 0 AND (nom LIKE ? OR prenom LIKE ? OR role LIKE ?)
    ORDER BY nom, prenom LIMIT 5`, [q, q, q])

  const commandes = dbAll(`SELECT c.id, c.reference_commande, c.date_commande, c.statut, f.nom as fournisseur_nom
    FROM commandes c LEFT JOIN fournisseurs f ON f.id = c.fournisseur_id
    WHERE c.reference_commande LIKE ? OR f.nom LIKE ?
    ORDER BY c.date_commande DESC LIMIT 5`, [q, q])

  return { produits, fournisseurs, praticiens, commandes }
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
    const remiseId = dbInsert('INSERT INTO remises_fournisseur (fournisseur_id, seuil_quantite, remise_pourcent, description) VALUES (?, ?, ?, ?)',
      [data.fournisseur_id, data.seuil_quantite, data.remise_pourcent, data.description || null])
    logAuditEntry({
      action: 'CREATE',
      module: 'REMISES',
      targetType: 'remise',
      targetId: remiseId,
      targetLabel: `Remise fournisseur #${remiseId}`,
      summary: `Remise fournisseur ajoutee.`,
      details: `Seuil ${data.seuil_quantite} - ${data.remise_pourcent}%`,
    })
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('remises:update', async (_, id, data) => {
  return withWriteTransaction(() => {
    dbRun('UPDATE remises_fournisseur SET seuil_quantite = ?, remise_pourcent = ?, description = ? WHERE id = ?',
      [data.seuil_quantite, data.remise_pourcent, data.description || null, id])
    logAuditEntry({
      action: 'UPDATE',
      module: 'REMISES',
      targetType: 'remise',
      targetId: id,
      targetLabel: `Remise fournisseur #${id}`,
      summary: `Remise fournisseur mise a jour.`,
      details: `Seuil ${data.seuil_quantite} - ${data.remise_pourcent}%`,
    })
  }, { permission: 'fournisseurs_edit' })
})

safeHandle('remises:delete', async (_, id) => {
  return withWriteTransaction(() => {
    dbRun('DELETE FROM remises_fournisseur WHERE id = ?', [id])
    logAuditEntry({
      action: 'DELETE',
      module: 'REMISES',
      targetType: 'remise',
      targetId: id,
      targetLabel: `Remise fournisseur #${id}`,
      summary: `Remise fournisseur supprimee.`,
    })
  }, { permission: 'fournisseurs_edit' })
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

  // Migration : recuperer config + donnees laissees dans l'ancien install dir
  // (les versions <= 2.5.1 stockaient ces fichiers la, et NSIS les ecrasait a chaque update)
  migrateLegacyDataIfNeeded()

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
      try {
        runWeeklyBackupIfNeeded()
        runMonthlyBackupIfNeeded()
      } catch (err) {
        console.error('[DentaStock] Erreur backups auto:', err.message)
      }
    }
  } else {
    // Pas encore configure : on verifie si une base existe deja (migration ancienne install)
    const defaultDb = getDefaultDbPath()
    if (fs.existsSync(defaultDb) && fs.statSync(defaultDb).size > 0) {
      // Ancienne install, migrer vers mode serveur automatiquement
      const localDataPath = getServerLocalDataPath()
      saveSetupConfig({ mode: 'server', dataPath: localDataPath })
      try {
        await initDatabase(defaultDb)
        try {
          runWeeklyBackupIfNeeded()
          runMonthlyBackupIfNeeded()
        } catch (err) {
          console.error('[DentaStock] Erreur backups auto:', err.message)
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
