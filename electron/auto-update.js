const { autoUpdater } = require('electron-updater')
const { dialog } = require('electron')

let mainWindow = null

function init(win) {
  mainWindow = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
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

  autoUpdater.on('update-not-available', () => {
    // silent
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100)
    }
  })

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) mainWindow.setProgressBar(-1)
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
  })

  // Check for updates after 5 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 5000)
}

function checkNow() {
  return autoUpdater.checkForUpdates()
}

module.exports = { init, checkNow }
