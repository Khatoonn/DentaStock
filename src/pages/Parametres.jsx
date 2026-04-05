import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_STATUS = {
  mode: 'shared',
  storageRoot: 'E:\\Cabinet\\DentaStock',
  dbPath: 'E:\\Cabinet\\DentaStock\\database\\dentastock.db',
  dbDirectory: 'E:\\Cabinet\\DentaStock\\database',
  documentsPath: 'E:\\Cabinet\\DentaStock\\documents',
}

function PathBlock({ label, value }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 break-all">
        {value || 'Non configure'}
      </div>
    </div>
  )
}

export default function Parametres() {
  const [status, setStatus] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [backupInfo, setBackupInfo] = useState(null)
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState(true)
  const { toast, confirm } = useToast()
  const [saving, setSaving] = useState(false)
  const [runningAutoBackup, setRunningAutoBackup] = useState(false)
  const [verifyingBackup, setVerifyingBackup] = useState('')

  const load = async () => {
    setLoading(true)

    if (isElectron) {
      try {
        const [nextStatus, nextSetup, nextBackup] = await Promise.all([
          window.api.storageGetStatus(),
          window.api.setupGetConfig(),
          window.api.backupStatus(),
        ])
        setStatus(nextStatus)
        setSetupConfig(nextSetup)
        setBackupInfo(nextBackup)
        setFolderPath(nextStatus.storageRoot || '')
      } catch (err) {
        toast(err.message || 'Impossible de charger la configuration de stockage.', 'error')
      } finally {
        setLoading(false)
      }
      return
    }

    setStatus(DEMO_STATUS)
    setFolderPath(DEMO_STATUS.storageRoot)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const pickDirectory = async () => {
    if (!isElectron) return

    const pickedPath = await window.api.dialogOpenDirectory()
    if (pickedPath) {
      setFolderPath(pickedPath)

    }
  }

  const saveStorage = async () => {
    if (!folderPath.trim()) {
      toast('Veuillez renseigner un dossier cible.', 'error')
      return
    }

    setSaving(true)



    try {
      const nextStatus = await window.api.storageSetRoot(folderPath.trim())
      setStatus(nextStatus)
      setFolderPath(nextStatus.storageRoot || folderPath.trim())

      if (nextStatus.databaseState === 'existing') {
        toast('Le dossier partage a ete applique et la base existante a ete ouverte.')
      } else {
        toast('Le dossier partage a ete applique et la base courante a ete copiee.')
      }
    } catch (err) {
      toast(err.message || 'Impossible d appliquer ce dossier partage.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Chargement de la configuration...
      </div>
    )
  }

  const sharedMode = status?.mode === 'shared'

  const runAutoBackupNow = async () => {
    if (!isElectron) return
    setRunningAutoBackup(true)
    try {
      await window.api.backupRunAutoNow()
      toast('Sauvegarde automatique lancee.', 'success')
      await load()
    } catch (err) {
      toast(err.message || 'Impossible de lancer la sauvegarde automatique.', 'error')
    } finally {
      setRunningAutoBackup(false)
    }
  }

  const verifyBackup = async (backupName = '') => {
    if (!isElectron) return
    setVerifyingBackup(backupName || '__latest__')
    try {
      const result = await window.api.backupVerifyIntegrity(backupName || null)
      if (result?.ok) {
        toast(`Integrite OK sur ${result.backupName}.`, 'success')
      } else {
        toast(`Probleme detecte sur ${result?.backupName || 'la sauvegarde'}.`, 'error')
      }
      await load()
    } catch (err) {
      toast(err.message || 'Impossible de verifier la sauvegarde.', 'error')
    } finally {
      setVerifyingBackup('')
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Mode serveur/client */}
      {setupConfig && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${setupConfig.mode === 'server' ? 'bg-sky-500/15' : 'bg-emerald-500/15'}`}>
                <svg className={`w-6 h-6 ${setupConfig.mode === 'server' ? 'text-sky-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {setupConfig.mode === 'server'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  }
                </svg>
              </div>
              <div>
                <div className="text-lg font-semibold text-white">
                  Mode {setupConfig.mode === 'server' ? 'Serveur' : 'Client'}
                </div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {setupConfig.mode === 'server'
                    ? 'Ce poste stocke la base de donnees. Partagez le dossier data pour les autres postes.'
                    : `Connecte a : ${setupConfig.dataPath}`
                  }
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Base : {setupConfig.dataPath}
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (await confirm('Reinitialiser la configuration serveur/client ? L application redemarrera avec l ecran de configuration.')) {
                  await window.api.setupReset()
                  window.location.reload()
                }
              }}
              className="text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Reconfigurer
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Mode actif</div>
          <div className="flex items-center justify-between mt-3">
            <div>
              <div className="text-2xl font-bold text-white">
                {sharedMode ? 'Partage reseau' : 'Stockage local'}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Les fichiers joints sont copies automatiquement dans l archive DentaStock.
              </div>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sharedMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700 text-slate-300'}`}>
              {sharedMode ? 'Partage' : 'Local'}
            </span>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Base de donnees</div>
          <div className="text-2xl font-bold text-white mt-3">SQLite centralisee</div>
          <div className="text-sm text-slate-400 mt-1">
            Le fichier actif est celui charge par Electron pour les ecritures du stock.
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Les ecritures sont rechargees depuis le disque avant validation pour mieux tenir un usage reseau local.
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Archive documents</div>
          <div className="text-2xl font-bold text-white mt-3">BL et factures</div>
          <div className="text-sm text-slate-400 mt-1">
            Chaque piece jointe est recopied dans un dossier date, puis memorisee dans la GED.
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Structure creee automatiquement: <span className="font-mono">database</span> et <span className="font-mono">documents</span>.
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Configurer le dossier partage</h3>
          <p className="text-sm text-slate-400 mt-1">
            Choisissez un dossier commun du cabinet, par exemple un partage reseau. DentaStock y placera la base et les archives.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
          <input
            type="text"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="\\\\SERVEUR\\Commun\\DentaStock"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
          />
          <button
            onClick={pickDirectory}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Choisir...
          </button>
          <button
            onClick={saveStorage}
            disabled={!isElectron || saving}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Application...' : 'Appliquer'}
          </button>
        </div>

        {!isElectron && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Mode navigateur: cette page montre seulement une maquette. Le parametrage fonctionne dans Electron.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PathBlock label="Dossier partage actif" value={status?.storageRoot || 'Aucun dossier partage configure'} />
          <PathBlock label="Dossier archives documents" value={status?.documentsPath} />
          <PathBlock label="Fichier base de donnees" value={status?.dbPath} />
          <PathBlock label="Dossier base de donnees" value={status?.dbDirectory} />
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Sauvegarde et restauration</h3>
          <p className="text-sm text-slate-400 mt-1">
            Exportez votre base de donnees pour en faire une sauvegarde, ou importez une sauvegarde existante.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white">Exporter la base</div>
                <div className="text-xs text-slate-400">Sauvegarder dans un fichier .db</div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!isElectron) return


                try {
                  const path = await window.api.dbExport()
                  if (path) toast(`Base exportee vers : ${path}`)
                } catch (err) {
                  toast(err.message, 'error')
                }
              }}
              disabled={!isElectron}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Exporter...
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white">Importer une base</div>
                <div className="text-xs text-slate-400">Remplace la base actuelle (sauvegarde auto)</div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!isElectron) return


                try {
                  const result = await window.api.dbImport()
                  if (result) {
                    toast(`Base importee depuis : ${result.imported}. Sauvegarde de l'ancienne : ${result.backup}`)
                    load()
                  }
                } catch (err) {
                  toast(err.message, 'error')
                }
              }}
              disabled={!isElectron}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Importer...
            </button>
          </div>
        </div>
      </div>

      {/* Sauvegardes automatiques & Replication */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Sauvegardes automatiques</h3>
            <p className="text-sm text-slate-400 mt-1">
              Sauvegarde hebdomadaire roulante sur 8 semaines, mensuelle compressee sur 12 mois, et point de restauration auto avant import ou restauration.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!isElectron) return
              void 0; void 0
              try {
                const p = await window.api.backupRunNow()
                toast(`Sauvegarde manuelle creee : ${p}`)
                load()
              } catch (err) { toast(err.message, 'error') }
            }}
            disabled={!isElectron}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            Sauvegarder maintenant
          </button>
        </div>

        {backupInfo && (
          <>
            {backupInfo.autoBackupOverdue && (
              <div className={`rounded-xl border px-4 py-4 ${backupInfo.autoBackupWarningLevel === 'red' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${backupInfo.autoBackupWarningLevel === 'red' ? 'text-red-200' : 'text-amber-200'}`}>
                      Sauvegarde automatique en retard
                    </div>
                    <div className={`text-sm mt-1 ${backupInfo.autoBackupWarningLevel === 'red' ? 'text-red-100' : 'text-amber-100'}`}>
                      La derniere sauvegarde auto date de {backupInfo.autoBackupDelayDays ?? '?'} jour{backupInfo.autoBackupDelayDays > 1 ? 's' : ''}.
                    </div>
                  </div>
                  <button
                    onClick={runAutoBackupNow}
                    disabled={!isElectron || runningAutoBackup}
                    className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${backupInfo.autoBackupWarningLevel === 'red' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'} disabled:opacity-50`}
                  >
                    {runningAutoBackup ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
                  </button>
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500">
              Les donnees metier ne sont plus purgees automatiquement. Les sauvegardes anciennes sont simplement retirees au fil de l eau.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Derniere sauvegarde hebdo</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastWeeklyBackup
                    ? new Date(backupInfo.lastWeeklyBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Aucune'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Derniere sauvegarde mensuelle</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastMonthlyBackup
                    ? new Date(backupInfo.lastMonthlyBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Aucune'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sauvegardes conservees</div>
                <div className="text-sm font-medium text-white mt-2">{backupInfo.backups.length} fichier{backupInfo.backups.length > 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Dossier</div>
                <div className="text-xs text-slate-300 mt-2 break-all">{backupInfo.backupDir}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Dernier controle d integrite</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastIntegrityCheck
                    ? (backupInfo.lastIntegrityCheck.ok ? 'Integrite OK' : 'Probleme detecte')
                    : 'Aucun controle lance'
                  }
                </div>
                <div className="text-xs text-slate-400 mt-2 break-all">
                  {backupInfo.lastIntegrityCheck
                    ? `${new Date(backupInfo.lastIntegrityCheck.checkedAt).toLocaleString('fr-FR')} - ${backupInfo.lastIntegrityCheck.backupName}`
                    : 'Utilisez le bouton ci-dessous pour verifier une sauvegarde sans la restaurer.'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Test de restauration</div>
                  <div className="text-sm text-slate-300 mt-2">
                    Controle la sauvegarde la plus recente avec <span className="font-mono">PRAGMA integrity_check</span>, sans toucher a la base active.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => verifyBackup()}
                    disabled={!isElectron || verifyingBackup !== ''}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {verifyingBackup === '__latest__' ? 'Verification...' : 'Verifier la plus recente'}
                  </button>
                  <button
                    onClick={runAutoBackupNow}
                    disabled={!isElectron || runningAutoBackup}
                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {runningAutoBackup ? 'Sauvegarde...' : 'Lancer une sauvegarde auto'}
                  </button>
                </div>
              </div>
            </div>

            {backupInfo.backups.length > 0 && (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 text-xs font-medium text-slate-400">
                  Historique des sauvegardes
                </div>
                <div className="divide-y divide-slate-700/50 max-h-48 overflow-y-auto">
                  {backupInfo.backups.map(b => (
                    <div key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-700/30">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{b.name}</div>
                        <div className="text-xs text-slate-500">{new Date(b.date).toLocaleDateString('fr-FR')} - {(b.size / 1024).toFixed(0)} Ko</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!(await confirm(`Restaurer la sauvegarde "${b.name}" ? La base actuelle sera sauvegardee avant.`))) return
          
                          try {
                            const r = await window.api.backupRestore(b.name)
                            toast(`Base restauree depuis ${r.restored}. Ancienne sauvegardee dans ${r.backup}`)
                            load()
                          } catch (err) { toast(err.message, 'error') }
                        }}
                        className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1 rounded-lg shrink-0"
                      >
                        Restaurer
                      </button>
                      <button
                        onClick={() => verifyBackup(b.name)}
                        disabled={!isElectron || verifyingBackup !== ''}
                        className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 px-3 py-1 rounded-lg shrink-0"
                      >
                        {verifyingBackup === b.name ? 'Verification...' : 'Verifier'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Replica info (client only) */}
            {backupInfo.replica && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Replica locale</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Copie de secours synchronisee toutes les 5 min depuis le serveur
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {backupInfo.serverReachable !== null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${backupInfo.serverReachable ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {backupInfo.serverReachable ? 'Serveur connecte' : 'Serveur injoignable'}
                      </span>
                    )}
                    <button
                      onClick={async () => {
        
                        try {
                          const r = await window.api.replicaSyncNow()
                          if (r.success) toast('Replica synchronisee.')
                          else toast('Impossible de synchroniser (serveur inaccessible).', 'error')
                          load()
                        } catch (err) { toast(err.message, 'error') }
                      }}
                      className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1 rounded-lg"
                    >
                      Synchro manuelle
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Derniere synchro : </span>
                    <span className="text-slate-300">
                      {backupInfo.replica.lastSync
                        ? new Date(backupInfo.replica.lastSync).toLocaleString('fr-FR')
                        : 'Jamais'
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Taille replica : </span>
                    <span className="text-slate-300">
                      {backupInfo.replica.size ? `${(backupInfo.replica.size / 1024).toFixed(0)} Ko` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white">Ce que cette version gere</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Receptions</div>
            <div className="text-sm text-slate-400 mt-2">
              Le document joint d une reception est copie dans l archive et un bon de livraison GED est cree automatiquement.
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Documents</div>
            <div className="text-sm text-slate-400 mt-2">
              L import manuel dans la GED stocke des copies propres, sans dependre du chemin source d origine.
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Postes du cabinet</div>
            <div className="text-sm text-slate-400 mt-2">
              Chaque poste peut pointer vers le meme dossier reseau pour partager la base et les pieces archivees.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
