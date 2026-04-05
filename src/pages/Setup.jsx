import { useEffect, useState } from 'react'

export default function Setup({ onComplete }) {
  const [mode, setMode] = useState(null)
  const [networkPath, setNetworkPath] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [adminPinConfirm, setAdminPinConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [defaults, setDefaults] = useState(null)

  useEffect(() => {
    if (!window.api?.setupGetDefaults) return
    window.api.setupGetDefaults().then(setDefaults).catch(() => setDefaults(null))
  }, [])

  const serverDataPath = defaults?.serverDataPath || '...'
  const defaultAdminReference = defaults?.defaultAdminReference || '1'
  const serverShareName = serverDataPath.split(/[\\/]/).filter(Boolean).pop() || 'data'
  const serverShareExample = `\\\\NOM-DU-PC\\${serverShareName}`

  const browse = async () => {
    const folder = await window.api.setupBrowseFolder()
    if (folder) setNetworkPath(folder)
  }

  const confirm = async () => {
    setLoading(true)
    setError('')

    try {
      if (mode === 'server') {
        if (adminPin.length !== 4) {
          setError('Veuillez definir un code PIN administrateur a 4 chiffres.')
          setLoading(false)
          return
        }
        if (adminPin !== adminPinConfirm) {
          setError('La confirmation du code PIN administrateur ne correspond pas.')
          setLoading(false)
          return
        }
        await window.api.setupConfigure({ mode: 'server', initialAdminPin: adminPin })
      } else {
        if (!networkPath.trim()) {
          setError('Veuillez indiquer le chemin vers le dossier data du serveur.')
          setLoading(false)
          return
        }
        await window.api.setupConfigure({ mode: 'client', dataPath: networkPath.trim() })
      }
      onComplete()
    } catch (e) {
      setError(e.message || 'Erreur de configuration.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500 mb-4">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Bienvenue sur DentaStock</h1>
          <p className="text-slate-400 mt-2">Choisissez le mode d'installation pour ce poste</p>
        </div>

        {/* Mode selection */}
        {!mode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => { setMode('server'); setError('') }}
              className="bg-slate-800 border-2 border-slate-700 hover:border-sky-500 rounded-xl p-6 text-left transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white group-hover:text-sky-300 transition-colors">Serveur</h3>
              <p className="text-sm text-slate-400 mt-2">
                Ce PC stocke la base de donnees. Les autres postes du cabinet se connectent a celui-ci.
              </p>
              <div className="mt-4 text-xs text-slate-500">
                Recommande pour le poste principal
              </div>
            </button>

            <button
              onClick={() => { setMode('client'); setError('') }}
              className="bg-slate-800 border-2 border-slate-700 hover:border-emerald-500 rounded-xl p-6 text-left transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors">Client</h3>
              <p className="text-sm text-slate-400 mt-2">
                Ce PC utilise la base de donnees stockee sur le serveur via le reseau local.
              </p>
              <div className="mt-4 text-xs text-slate-500">
                Pour les postes secondaires
              </div>
            </button>
          </div>
        )}

        {/* Server config */}
        {mode === 'server' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white">Mode Serveur</h3>
                <p className="text-xs text-slate-400 mt-0.5">La base sera stockee localement dans {serverDataPath}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-white">Apres l'installation :</h4>
              <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
                <li>Partagez le dossier <code className="text-sky-300 bg-slate-700 px-1.5 py-0.5 rounded text-xs">{serverDataPath}</code> sur le reseau Windows</li>
                <li>Clic droit sur le dossier &rarr; Proprietes &rarr; Partage &rarr; Partager</li>
                <li>Donnez les droits de lecture/ecriture aux utilisateurs du cabinet</li>
                <li>Notez le chemin reseau (ex: <code className="text-sky-300 bg-slate-700 px-1.5 py-0.5 rounded text-xs">{serverShareExample}</code>)</li>
              </ol>
            </div>

            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-white">Compte administrateur de depart</h4>
                <p className="text-xs text-slate-400 mt-1">
                  L administrateur cree a l installation utilisera la reference <span className="text-sky-300 font-medium">{defaultAdminReference}</span>.
                  Definissez maintenant son code PIN pour eviter un code par defaut.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Code PIN administrateur</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={adminPin}
                    onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Confirmation du PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={adminPinConfirm}
                    onChange={e => setAdminPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0000"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Vous pourrez ensuite modifier ce compte et ajouter d autres operateurs depuis les parametres du logiciel.
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={() => { setMode(null); setError('') }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                Retour
              </button>
              <button onClick={confirm} disabled={loading}
                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                {loading ? 'Configuration en cours...' : 'Installer en mode Serveur'}
              </button>
            </div>
          </div>
        )}

        {/* Client config */}
        {mode === 'client' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-white">Mode Client</h3>
                <p className="text-xs text-slate-400 mt-0.5">Se connecter a la base d'un autre PC</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-2">
                Chemin reseau vers le dossier data du serveur
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={networkPath}
                  onChange={e => setNetworkPath(e.target.value)}
                  placeholder="\\NOM-DU-PC\data ou Z:\DentaStock\data"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                />
                <button onClick={browse}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shrink-0">
                  Parcourir
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Le dossier doit contenir le fichier <code className="text-emerald-300">dentastock.db</code> cree par le poste serveur.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button onClick={() => { setMode(null); setError('') }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                Retour
              </button>
              <button onClick={confirm} disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
                {loading ? 'Connexion en cours...' : 'Se connecter au serveur'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
