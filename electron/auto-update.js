const { autoUpdater } = require('electron-updater')
const { dialog, app } = require('electron')

let mainWindow = null
let lastStatus = { state: 'idle', message: '', version: null, progress: 0 }

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function setStatus(state, extra = {}) {
  lastStatus = { ...lastStatus, state, ...extra }
  send('updates:status', lastStatus)
}

function init(win) {
  mainWindow = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setStatus('checking', { message: 'Verification des mises a jour...' })
  })

  autoUpdater.on('update-available', (info) => {
    setStatus('available', {
      message: `Version ${info.version} disponible`,
      version: info.version,
    })

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise a jour disponible',
      message: `Une nouvelle version (${info.version}) est disponible. Voulez-vous la telecharger ?`,
      buttons: ['Telecharger', 'Plus tard'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate()
      }
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    setStatus('up-to-date', {
      message: `Vous utilisez la derniere version (${info?.version || app.getVersion()})`,
      version: info?.version || app.getVersion(),
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100)
    }
    setStatus('downloading', {
      message: `Telechargement... ${Math.round(progress.percent)}%`,
      progress: progress.percent,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.setProgressBar(-1)
    setStatus('downloaded', {
      message: `Version ${info.version} prete a installer`,
      version: info.version,
      progress: 100,
    })

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Mise a jour prete',
      message: 'La mise a jour a ete telechargee. L\'application va redemarrer pour l\'installer.',
      buttons: ['Redemarrer maintenant', 'Plus tard'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdate] Erreur:', err.message)
    setStatus('error', { message: err.message || 'Erreur de mise a jour' })
  })

  // Verification automatique 5 secondes apres le demarrage
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}

function checkNow() {
  if (!autoUpdater) return Promise.reject(new Error('Auto-update non initialise'))
  return autoUpdater.checkForUpdates()
}

function downloadNow() {
  return autoUpdater.downloadUpdate()
}

function installNow() {
  autoUpdater.quitAndInstall()
}

function getStatus() {
  return { ...lastStatus, currentVersion: app.getVersion() }
}

module.exports = { init, checkNow, downloadNow, installNow, getStatus }
