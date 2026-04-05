// Database helper functions extracted from main.js
// Call init() before using any exported function.

let getDb = null      // () => db instance
let _ipcMain = null   // electron ipcMain
let _refreshDatabaseIfNeeded = null
let _acquireWriteLock = null
let _loadDatabaseFromFile = null
let _ensureSchema = null
let _saveDatabase = null
let _getDbPath = null
let _tableHasColumn = null

let inWriteTransaction = false

/**
 * Initialise the module with references from main.js.
 *
 * @param {Function} dbGetter    – () => db  (returns current sql.js Database)
 * @param {Object}   ipcMainRef  – electron ipcMain module
 * @param {Object}   ctx         – extra helpers that live in main.js:
 *   { refreshDatabaseIfNeeded, acquireWriteLock, loadDatabaseFromFile,
 *     ensureSchema, saveDatabase, getDbPath, tableHasColumn }
 */
function init(dbGetter, ipcMainRef, ctx = {}) {
  getDb = dbGetter
  _ipcMain = ipcMainRef
  _refreshDatabaseIfNeeded = ctx.refreshDatabaseIfNeeded || (() => {})
  _acquireWriteLock = ctx.acquireWriteLock
  _loadDatabaseFromFile = ctx.loadDatabaseFromFile
  _ensureSchema = ctx.ensureSchema
  _saveDatabase = ctx.saveDatabase
  _getDbPath = ctx.getDbPath || (() => '')
  _tableHasColumn = ctx.tableHasColumn
}

function ensureColumn(tableName, columnName, sqlDefinition) {
  if (!_tableHasColumn(tableName, columnName)) {
    getDb().run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`)
  }
}

function dbRun(sql, params = []) {
  getDb().run(sql, params)
}

function dbGet(sql, params = []) {
  _refreshDatabaseIfNeeded()

  const db = getDb()
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
  _refreshDatabaseIfNeeded()

  const db = getDb()
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []

  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }

  stmt.free()
  return rows
}

async function withWriteTransaction(work) {
  const release = await _acquireWriteLock()

  try {
    _loadDatabaseFromFile(_getDbPath())
    _ensureSchema()

    const db = getDb()
    inWriteTransaction = true
    db.run('BEGIN')

    try {
      const result = work()
      db.run('COMMIT')
      _saveDatabase()
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

/**
 * Returns true when inside a write transaction (used by refreshDatabaseIfNeeded
 * in main.js to skip reloading while a write is in progress).
 */
function isInWriteTransaction() {
  return inWriteTransaction
}

function safeHandle(channel, handler) {
  _ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      console.error(`[IPC:${channel}] Erreur:`, error.message)
      throw error
    }
  })
}

module.exports = {
  init,
  ensureColumn,
  dbAll,
  dbRun,
  dbGet,
  withWriteTransaction,
  isInWriteTransaction,
  safeHandle,
}
