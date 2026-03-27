import { useEffect, useState } from 'react'

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
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)

    if (isElectron) {
      try {
        const nextStatus = await window.api.storageGetStatus()
        setStatus(nextStatus)
        setFolderPath(nextStatus.storageRoot || '')
      } catch (err) {
        setError(err.message || 'Impossible de charger la configuration de stockage.')
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
      setError('')
    }
  }

  const saveStorage = async () => {
    if (!folderPath.trim()) {
      setError('Veuillez renseigner un dossier cible.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const nextStatus = await window.api.storageSetRoot(folderPath.trim())
      setStatus(nextStatus)
      setFolderPath(nextStatus.storageRoot || folderPath.trim())

      if (nextStatus.databaseState === 'existing') {
        setSuccess('Le dossier partage a ete applique et la base existante a ete ouverte.')
      } else {
        setSuccess('Le dossier partage a ete applique et la base courante a ete copiee.')
      }
    } catch (err) {
      setError(err.message || 'Impossible d appliquer ce dossier partage.')
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

  return (
    <div className="space-y-6 w-full min-w-0">
      {success && (
        <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-5 py-3 text-cyan-200 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-200 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
          {error}
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
                setError('')
                setSuccess('')
                try {
                  const path = await window.api.dbExport()
                  if (path) setSuccess(`Base exportee vers : ${path}`)
                } catch (err) {
                  setError(err.message)
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
                setError('')
                setSuccess('')
                try {
                  const result = await window.api.dbImport()
                  if (result) {
                    setSuccess(`Base importee depuis : ${result.imported}. Sauvegarde de l'ancienne : ${result.backup}`)
                    load()
                  }
                } catch (err) {
                  setError(err.message)
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
