import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Setup from './pages/Setup'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import { useToast } from './components/Toast'

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
const Journal = lazy(() => import('./pages/Journal'))

function LoginScreen({ operators, loginForm, setLoginForm, loggingIn, onSubmit }) {
  const pinInputRef = useRef(null)
  const selectedOperator = useMemo(
    () => operators.find(operator => String(operator.reference_code || '') === String(loginForm.reference_code || '')) || null,
    [operators, loginForm.reference_code]
  )

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5">
          <div>
            <div className="text-sm uppercase tracking-[0.25em] text-sky-400">DentaStock</div>
            <h1 className="text-3xl font-semibold text-white mt-3">Connexion operateur</h1>
            <p className="text-sm text-slate-400 mt-2">
              Selectionnez votre operateur puis entrez votre code PIN a 4 chiffres pour ouvrir la session du poste.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Operateur</label>
              <select
                value={loginForm.reference_code}
                onChange={e => {
                  const nextReference = e.target.value
                  setLoginForm(current => ({
                    ...current,
                    reference_code: nextReference,
                    pin: '',
                  }))
                  window.setTimeout(() => pinInputRef.current?.focus(), 0)
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base text-white"
                autoFocus
              >
                <option value="">-- Selectionner un operateur --</option>
                {operators.map(operator => (
                  <option key={operator.id} value={operator.reference_code}>
                    {operator.nom_complet || operator.nom}
                  </option>
                ))}
              </select>
              {selectedOperator && (
                <div className="mt-2 text-xs text-slate-500">
                  Ref. {selectedOperator.reference_code} - {selectedOperator.role === 'ADMIN' ? 'Administrateur' : selectedOperator.role === 'LECTURE' ? 'Lecture seule' : 'Equipe'}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Code PIN</label>
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={loginForm.pin}
                onChange={e => {
                  const nextPin = e.target.value.replace(/\D/g, '').slice(0, 4)
                  const nextForm = { ...loginForm, pin: nextPin }
                  setLoginForm(nextForm)

                  if (loginForm.reference_code && nextPin.length === 4 && !loggingIn) {
                    window.setTimeout(() => {
                      void onSubmit(nextForm)
                    }, 0)
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                  onSubmit()
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base tracking-[0.4em] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="0000"
                disabled={!loginForm.reference_code}
              />
            </div>
          </div>

          <button
            onClick={onSubmit}
            disabled={loggingIn || !loginForm.reference_code || loginForm.pin.length !== 4}
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-3 rounded-xl transition-colors"
          >
            {loggingIn ? 'Connexion...' : 'Se connecter'}
          </button>

          <div className="text-xs text-slate-500">
            Le nom de l operateur connecte apparaitra ensuite en haut de l application pour la tracabilite.
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Operateurs actifs</h2>
              <p className="text-sm text-slate-400 mt-1">La connexion quotidienne se fait maintenant par selection de nom puis saisie rapide du PIN.</p>
            </div>
            <div className="text-sm text-slate-500">
              {operators.length} operateur{operators.length > 1 ? 's' : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {operators.map(operator => (
              <div
                key={operator.id}
                className={`text-left rounded-2xl border px-5 py-4 transition-colors min-w-0 ${
                  String(selectedOperator?.id || '') === String(operator.id)
                    ? 'border-sky-500/40 bg-sky-500/10'
                    : 'border-slate-800 bg-slate-950/60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-500">Ref. {operator.reference_code}</div>
                    <div className="text-base font-medium text-white mt-1 truncate">
                      {operator.nom_complet || operator.nom}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase whitespace-nowrap ${
                    operator.role === 'ADMIN'
                      ? 'bg-sky-500/15 text-sky-300'
                      : operator.role === 'LECTURE'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                  }`}>
                    {operator.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [setupDone, setSetupDone] = useState(null) // null = loading, true/false
  const [serverStatus, setServerStatus] = useState(null)
  const [retryingServer, setRetryingServer] = useState(false)
  const [promotingServer, setPromotingServer] = useState(false)
  const [dismissedReadonlyBanner, setDismissedReadonlyBanner] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authSession, setAuthSession] = useState({ authenticated: !isElectron, operator: null })
  const [loginOperators, setLoginOperators] = useState([])
  const [loginForm, setLoginForm] = useState({ reference_code: '', pin: '' })
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = useCallback(async (credentials = loginForm) => {
    if (!isElectron) return

    const nextCredentials = {
      reference_code: String(credentials?.reference_code || ''),
      pin: String(credentials?.pin || ''),
    }

    if (!nextCredentials.reference_code || nextCredentials.pin.length !== 4) {
      return
    }

    setLoggingIn(true)
    try {
      const session = await window.api.authLogin(nextCredentials)
      setAuthSession(session)
      setLoginForm(current => ({ ...current, pin: '' }))
      window.dispatchEvent(new Event('dentastock-session-changed'))
      toast(`Connexion de ${session?.operator?.nom_complet || 'l operateur'} reussie.`, 'success')
    } catch (error) {
      toast(error?.message || 'Impossible de se connecter.', 'error')
    } finally {
      setLoggingIn(false)
    }
  }, [loginForm, toast])

  const refreshAuthState = async () => {
    if (!isElectron || !window.api.authGetSession) {
      setAuthSession({ authenticated: true, operator: null })
      setAuthLoading(false)
      return
    }

    setAuthLoading(true)
    try {
      const [session, operators] = await Promise.all([
        window.api.authGetSession(),
        window.api.authListOperators ? window.api.authListOperators() : Promise.resolve([]),
      ])
      setAuthSession(session || { authenticated: false, operator: null })
      setLoginOperators(operators || [])
      if (!(session?.authenticated) && !loginForm.reference_code && operators?.length === 1) {
        setLoginForm(current => ({ ...current, reference_code: String(operators[0].reference_code || '') }))
      }
    } finally {
      setAuthLoading(false)
    }
  }

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
      setAuthLoading(false)
      return
    }
    window.api.setupGetConfig().then(config => {
      setSetupDone(config !== null)
    })
  }, [])

  useEffect(() => {
    if (!setupDone) return
    void refreshAuthState()

    const refresh = () => void refreshAuthState()
    window.addEventListener('dentastock-session-changed', refresh)

    return () => {
      window.removeEventListener('dentastock-session-changed', refresh)
    }
  }, [setupDone])

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

  if (authLoading) {
    return (
      <div className="flex h-screen bg-slate-950 items-center justify-center">
        <div className="text-slate-400 text-sm">Chargement de la session operateur...</div>
      </div>
    )
  }

  if (!authSession?.authenticated) {
    return (
      <LoginScreen
        operators={loginOperators}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        loggingIn={loggingIn}
        onSubmit={handleLogin}
      />
    )
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
              <Route path="/journal" element={<Journal />} />
              <Route path="/parametres" element={<Parametres />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
