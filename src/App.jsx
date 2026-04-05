import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Setup from './pages/Setup'
import KeyboardShortcuts from './components/KeyboardShortcuts'

const isElectron = typeof window !== 'undefined' && window.api !== undefined
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Reception = lazy(() => import('./pages/Reception'))
const Consommation = lazy(() => import('./pages/Consommation'))
const Documents = lazy(() => import('./pages/Documents'))
const Fournisseurs = lazy(() => import('./pages/Fournisseurs'))
const Produits = lazy(() => import('./pages/Produits'))
const Praticiens = lazy(() => import('./pages/Praticiens'))
const Parametres = lazy(() => import('./pages/Parametres'))
const Statistiques = lazy(() => import('./pages/Statistiques'))

export default function App() {
  const navigate = useNavigate()
  const [setupDone, setSetupDone] = useState(null) // null = loading, true/false
  const [serverStatus, setServerStatus] = useState(null)
  const [retryingServer, setRetryingServer] = useState(false)
  const [promotingServer, setPromotingServer] = useState(false)
  const [dismissedReadonlyBanner, setDismissedReadonlyBanner] = useState(false)

  const refreshServerStatus = async ({ retry = false } = {}) => {
    if (!isElectron || !window.api.serverGetStatus) return null

    if (retry) setRetryingServer(true)

    try {
      const status = retry
        ? await window.api.serverRetryConnection()
        : await window.api.serverGetStatus()

      setServerStatus(status)

      if (!status?.readOnly) {
        setDismissedReadonlyBanner(false)
      }

      return status
    } catch {
      return null
    } finally {
      if (retry) setRetryingServer(false)
    }
  }

  useEffect(() => {
    if (!isElectron) {
      setSetupDone(true)
      return
    }
    window.api.setupGetConfig().then(config => {
      setSetupDone(config !== null)
    })
  }, [])

  useEffect(() => {
    if (!isElectron || !setupDone || !window.api.serverGetStatus) {
      setServerStatus(null)
      return
    }

    void refreshServerStatus()
    const interval = setInterval(() => {
      void refreshServerStatus()
    }, 10000)

    return () => clearInterval(interval)
  }, [setupDone])

  const promoteThisPosteToServer = async () => {
    if (!isElectron) return

    const confirmed = window.confirm(
      'Ce poste va etre reconfigure en mode serveur a partir de la copie locale de secours. Utilise cette option seulement si le vrai serveur reste indisponible. Continuer ?'
    )

    if (!confirmed) return

    setPromotingServer(true)

    try {
      await window.api.setupConfigure({ mode: 'server', seedFromReplica: true })
      window.location.reload()
    } catch (error) {
      window.alert(error?.message || 'Impossible de passer ce poste en serveur.')
    } finally {
      setPromotingServer(false)
    }
  }

  // Loading
  if (setupDone === null) {
    return (
      <div className="flex h-screen bg-slate-900 items-center justify-center">
        <div className="text-slate-400 text-sm">Chargement...</div>
      </div>
    )
  }

  // Setup screen
  if (!setupDone) {
    return <Setup onComplete={() => setSetupDone(true)} />
  }

  const showReadonlyBanner = serverStatus?.mode === 'client' && serverStatus?.readOnly
  const showCompactReadonlyBanner = showReadonlyBanner && dismissedReadonlyBanner
  const showDetailedReadonlyBanner = showReadonlyBanner && !dismissedReadonlyBanner

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <KeyboardShortcuts />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header />
        {showDetailedReadonlyBanner && (
          <div className="px-4 lg:px-6 pt-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm">
              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-amber-200">Serveur indisponible</div>
                  <div className="text-amber-100/90 mt-1">
                    Ce poste utilise la copie locale de secours en lecture seule. Les modifications redeviendront possibles automatiquement des que le serveur reviendra.
                  </div>
                  <div className="text-xs text-amber-200/80 mt-2 break-all">
                    Source configuree : {serverStatus?.serverDbPath || serverStatus?.dataPath || 'Serveur non detecte'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => void refreshServerStatus({ retry: true })}
                    disabled={retryingServer}
                    className="bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 text-amber-100 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {retryingServer ? 'Reconnexion...' : 'Reessayer'}
                  </button>
                  <button
                    onClick={() => setDismissedReadonlyBanner(true)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Continuer en lecture seule
                  </button>
                  <button
                    onClick={promoteThisPosteToServer}
                    disabled={promotingServer || !serverStatus?.replicaAvailable}
                    className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {promotingServer ? 'Bascule en cours...' : 'Passer ce poste en serveur'}
                  </button>
                  <button
                    onClick={() => navigate('/parametres')}
                    className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    Parametres
                  </button>
                </div>
              </div>
              {!serverStatus?.replicaAvailable && (
                <div className="text-xs text-red-200 mt-3">
                  Aucune copie locale n est disponible pour promouvoir ce poste en serveur. Il faut d abord retablir le serveur d origine.
                </div>
              )}
            </div>
          </div>
        )}
        {showCompactReadonlyBanner && (
          <div className="px-4 lg:px-6 pt-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                Serveur indisponible. Ce poste reste en lecture seule sur la copie locale de secours.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void refreshServerStatus({ retry: true })}
                  disabled={retryingServer}
                  className="bg-red-500/15 hover:bg-red-500/25 disabled:opacity-50 text-red-100 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  {retryingServer ? 'Reconnexion...' : 'Reessayer'}
                </button>
                <button
                  onClick={() => setDismissedReadonlyBanner(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Afficher les options
                </button>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-auto p-4 lg:p-6 min-w-0">
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500">Chargement de la page...</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/reception" element={<Reception />} />
              <Route path="/commandes" element={<Navigate to="/reception" replace />} />
              <Route path="/stock" element={<Navigate to="/produits" replace />} />
              <Route path="/consommation" element={<Consommation />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/produits" element={<Produits />} />
              <Route path="/fournisseurs" element={<Fournisseurs />} />
              <Route path="/praticiens" element={<Praticiens />} />
              <Route path="/statistiques" element={<Statistiques />} />
              <Route path="/parametres" element={<Parametres />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
