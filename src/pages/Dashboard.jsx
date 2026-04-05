import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_STATS = {
  totalProduits: 43,
  alertesStock: 5,
  commandesEnAttente: 2,
  receptionsMois: 3,
  montantMois: 1847.50,
  produitsAlerte: [
    { id: 1, nom: 'Articaine 4% 1/100 000', categorie: 'Anesthesie', stock_actuel: 2, unite: 'boite', stock_minimum: 5 },
    { id: 4, nom: 'Aiguilles 30G courtes (100)', categorie: 'Anesthesie', stock_actuel: 1, unite: 'boite', stock_minimum: 4 },
    { id: 22, nom: 'Gants nitrile M (100)', categorie: 'Hygiene', stock_actuel: 3, unite: 'boite', stock_minimum: 10 },
    { id: 23, nom: 'Gants nitrile L (100)', categorie: 'Hygiene', stock_actuel: 0, unite: 'boite', stock_minimum: 8 },
    { id: 6, nom: 'Composite A2 seringue 4g', categorie: 'Composite', stock_actuel: 2, unite: 'seringue', stock_minimum: 6 },
  ],
  dernieresReceptions: [
    { id: 27, fournisseur_nom: 'Henry Schein', reference_bl: 'BL-20260401-027', date: '2026-04-01', nb_produits: 6, montant_total: 892.30 },
    { id: 26, fournisseur_nom: 'Gacd', reference_bl: 'BL-20260402-026', date: '2026-04-02', nb_produits: 3, montant_total: 487.20 },
    { id: 25, fournisseur_nom: 'Promodentaire', reference_bl: 'BL-20260325-025', date: '2026-03-25', nb_produits: 5, montant_total: 312.80 },
  ],
  commandesEnCours: [
    { id: 28, fournisseur_nom: 'Henry Schein', reference_commande: 'CMD-202604-028', statut: 'EN_ATTENTE', montant_total: 1245.00 },
    { id: 29, fournisseur_nom: 'Dental Express', reference_commande: 'CMD-202604-029', statut: 'EN_ATTENTE', montant_total: 680.50 },
    { id: 30, fournisseur_nom: 'Gacd', reference_commande: 'CMD-202603-030', statut: 'PARTIELLE', montant_total: 534.80 },
  ],
  alertesPeremption: [
    { id: 1, nom: 'Articaine 4% 1/100 000', date_peremption: '2026-04-18', unite: 'boite', jours_restants: 13 },
    { id: 12, nom: 'Alginate prise rapide 500g', date_peremption: '2026-05-15', unite: 'sachet', jours_restants: 40 },
  ],
  alertesLots: [
    { produit_id: 6, nom: 'Composite A2 seringue 4g', lot: 'LOT-2024-089', date_expiration: '2026-04-20', quantite: 3, unite: 'seringue', jours_restants: 15 },
  ],
}

const DEMO_MONTHLY = [
  { label: 'nov. 25', achats: 3250.40 },
  { label: 'dec. 25', achats: 2180.60 },
  { label: 'janv. 26', achats: 2890.30 },
  { label: 'fevr. 26', achats: 1950.80 },
  { label: 'mars 26', achats: 3420.70 },
  { label: 'avr. 26', achats: 1847.50 },
]

const DEMO_SYSTEM = {
  setupMode: 'server',
  readOnly: false,
  serverReachable: null,
  replicaFresh: null,
  replicaLastSync: null,
  lastWeeklyBackup: '2026-04-03T08:15:00.000Z',
  lastMonthlyBackup: '2026-04-01T08:00:00.000Z',
  latestAutoBackup: '2026-04-03T08:15:00.000Z',
  autoBackupDelayDays: 2,
  autoBackupWarningLevel: 'green',
  autoBackupOverdue: false,
  lastIntegrityCheck: { backupName: 'dentastock-weekly-2026-W14.db.gz', checkedAt: '2026-04-03T08:20:00.000Z', ok: true, issues: [] },
}

const DEMO_AUDIT = [
  { id: 1, module: 'COMMANDES', summary: 'Commande CMD-2026-041 enregistree.', actor_name: 'Claire', created_at: '2026-04-05 08:48:00' },
  { id: 2, module: 'PRODUITS', summary: 'Fiche produit "Gants nitrile M" mise a jour.', actor_name: 'Administrateur', created_at: '2026-04-05 09:12:00' },
  { id: 3, module: 'RECEPTIONS', summary: 'Reception partielle ajoutee a BL-2026-122.', actor_name: 'Claire', created_at: '2026-04-04 16:15:00' },
]

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
}

function formatDateTime(value) {
  if (!value) return 'Aucune'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function HealthPill({ label, value, sub, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-900/60 border-slate-700 text-slate-200',
    green: 'bg-green-500/10 border-green-500/20 text-green-200',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-200',
    red: 'bg-red-500/10 border-red-500/20 text-red-200',
    sky: 'bg-sky-500/10 border-sky-500/20 text-sky-200',
  }

  return (
    <div className={`rounded-xl border px-4 py-3 min-w-0 ${tones[tone] || tones.slate}`}>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-semibold mt-1 break-words">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1 break-words">{sub}</div>}
    </div>
  )
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex items-center gap-4 min-w-0 h-full">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-white whitespace-nowrap tabular-nums">{value}</div>
        <div className="text-sm text-slate-400">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [stats, setStats] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [systemHealth, setSystemHealth] = useState(null)
  const [recentAudit, setRecentAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningAutoBackup, setRunningAutoBackup] = useState(false)
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false)

  useEffect(() => {
    let interval = null

    const loadSystemHealth = async () => {
      if (!isElectron) {
        setSystemHealth(DEMO_SYSTEM)
        return
      }

      const [backupInfo, setupConfig, serverStatus] = await Promise.all([
        window.api.backupStatus(),
        window.api.setupGetConfig(),
        window.api.serverGetStatus ? window.api.serverGetStatus() : Promise.resolve(null),
      ])

      const replicaLastSync = backupInfo?.replica?.lastSync || null
      const replicaFresh = replicaLastSync
        ? (Date.now() - new Date(replicaLastSync).getTime()) <= (15 * 60 * 1000)
        : null

      setSystemHealth({
        setupMode: setupConfig?.mode || null,
        readOnly: Boolean(serverStatus?.readOnly),
        serverReachable: serverStatus?.serverReachable ?? null,
        replicaFresh,
        replicaLastSync,
        lastWeeklyBackup: backupInfo?.lastWeeklyBackup || null,
        lastMonthlyBackup: backupInfo?.lastMonthlyBackup || null,
        latestAutoBackup: backupInfo?.latestAutoBackup || null,
        autoBackupDelayDays: backupInfo?.autoBackupDelayDays ?? null,
        autoBackupWarningLevel: backupInfo?.autoBackupWarningLevel || 'red',
        autoBackupOverdue: Boolean(backupInfo?.autoBackupOverdue),
        lastIntegrityCheck: backupInfo?.lastIntegrityCheck || null,
      })
    }

    if (isElectron) {
      Promise.all([
        window.api.statsDashboard(),
        window.api.statsMonthly(),
        window.api.auditList ? window.api.auditList({ limit: 5 }) : Promise.resolve([]),
      ]).then(([s, m, auditRows]) => {
        setStats(s)
        setMonthly(m)
        setRecentAudit(auditRows || [])
      }).finally(() => setLoading(false))
      void loadSystemHealth()
      interval = setInterval(() => {
        void loadSystemHealth()
      }, 15000)
    } else {
      setTimeout(() => {
        setStats(DEMO_STATS)
        setMonthly(DEMO_MONTHLY)
        setSystemHealth(DEMO_SYSTEM)
        setRecentAudit(DEMO_AUDIT)
        setLoading(false)
      }, 300)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Chargement...</div>
  }

  const {
    totalProduits,
    alertesStock,
    commandesEnAttente,
    receptionsMois,
    montantMois,
    produitsAlerte,
    dernieresReceptions,
    commandesEnCours,
    alertesPeremption = [],
    alertesLots = [],
  } = stats

  const latestBackup = [systemHealth?.lastWeeklyBackup, systemHealth?.lastMonthlyBackup]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null

  const modeLabel = systemHealth?.setupMode === 'server'
    ? 'Serveur'
    : systemHealth?.setupMode === 'client'
      ? 'Client'
      : 'Local'

  const connectionValue = systemHealth?.setupMode === 'client'
    ? (systemHealth?.serverReachable ? 'Serveur connecte' : 'Serveur indisponible')
    : systemHealth?.setupMode === 'server'
      ? 'Serveur principal'
      : 'Mode local'

  const connectionTone = systemHealth?.setupMode === 'client'
    ? (systemHealth?.serverReachable ? 'green' : 'red')
    : 'sky'

  const replicaValue = systemHealth?.setupMode === 'client'
    ? systemHealth?.replicaLastSync
      ? (systemHealth?.replicaFresh ? 'Replica a jour' : 'Replica a verifier')
      : 'Aucune replica'
    : 'Non applicable'

  const replicaTone = systemHealth?.setupMode === 'client'
    ? systemHealth?.replicaLastSync
      ? (systemHealth?.replicaFresh ? 'green' : 'amber')
      : 'red'
    : 'slate'

  const writeModeValue = systemHealth?.readOnly ? 'Lecture seule' : 'Ecriture autorisee'
  const writeModeTone = systemHealth?.readOnly ? 'amber' : 'green'
  const backupTone = systemHealth?.autoBackupWarningLevel === 'red'
    ? 'red'
    : systemHealth?.autoBackupWarningLevel === 'amber'
      ? 'amber'
      : 'green'
  const integrityTone = systemHealth?.lastIntegrityCheck?.ok === false
    ? 'red'
    : systemHealth?.lastIntegrityCheck?.ok === true
      ? 'green'
      : 'amber'

  const refreshHealthOnly = async () => {
    if (!isElectron) return
    const [backupInfo, setupConfig, serverStatus] = await Promise.all([
      window.api.backupStatus(),
      window.api.setupGetConfig(),
      window.api.serverGetStatus ? window.api.serverGetStatus() : Promise.resolve(null),
    ])

    const replicaLastSync = backupInfo?.replica?.lastSync || null
    const replicaFresh = replicaLastSync
      ? (Date.now() - new Date(replicaLastSync).getTime()) <= (15 * 60 * 1000)
      : null

    setSystemHealth({
      setupMode: setupConfig?.mode || null,
      readOnly: Boolean(serverStatus?.readOnly),
      serverReachable: serverStatus?.serverReachable ?? null,
      replicaFresh,
      replicaLastSync,
      lastWeeklyBackup: backupInfo?.lastWeeklyBackup || null,
      lastMonthlyBackup: backupInfo?.lastMonthlyBackup || null,
      latestAutoBackup: backupInfo?.latestAutoBackup || null,
      autoBackupDelayDays: backupInfo?.autoBackupDelayDays ?? null,
      autoBackupWarningLevel: backupInfo?.autoBackupWarningLevel || 'red',
      autoBackupOverdue: Boolean(backupInfo?.autoBackupOverdue),
      lastIntegrityCheck: backupInfo?.lastIntegrityCheck || null,
    })
  }

  const runImmediateAutoBackup = async () => {
    if (!isElectron) return
    setRunningAutoBackup(true)
    try {
      await window.api.backupRunAutoNow()
      await refreshHealthOnly()
      toast('Sauvegarde automatique lancee.', 'success')
    } catch (error) {
      toast(error?.message || 'Impossible de lancer la sauvegarde automatique.', 'error')
    } finally {
      setRunningAutoBackup(false)
    }
  }

  const verifyLatestBackup = async () => {
    if (!isElectron) return
    setVerifyingIntegrity(true)
    try {
      const result = await window.api.backupVerifyIntegrity()
      await refreshHealthOnly()
      if (result?.ok) toast(`Integrite OK sur ${result.backupName}.`, 'success')
      else toast(`Probleme detecte sur ${result?.backupName || 'la sauvegarde'}.`, 'error')
    } catch (error) {
      toast(error?.message || 'Impossible de verifier la sauvegarde.', 'error')
    } finally {
      setVerifyingIntegrity(false)
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {(alertesStock > 0 || alertesPeremption.length > 0 || alertesLots.length > 0) && (
        <div className="space-y-2">
          {alertesStock > 0 && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3">
              <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm text-red-300 font-medium min-w-0">
                {alertesStock} produit{alertesStock > 1 ? 's' : ''} en alerte de stock - commande recommandee
              </span>
            </div>
          )}
          {(alertesPeremption.length > 0 || alertesLots.length > 0) && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3">
              <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-amber-300 font-medium min-w-0">
                {alertesPeremption.length + alertesLots.length} produit{alertesPeremption.length + alertesLots.length > 1 ? 's' : ''} / lot{alertesLots.length > 1 ? 's' : ''} proche{alertesPeremption.length + alertesLots.length > 1 ? 's' : ''} de la peremption
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        <StatCard
          label="Produits references"
          value={totalProduits}
          color="bg-sky-500/20"
          icon={<svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
        />
        <StatCard
          label="Alertes stock bas"
          value={alertesStock}
          color={alertesStock > 0 ? 'bg-red-500/20' : 'bg-green-500/20'}
          icon={<svg className={`w-6 h-6 ${alertesStock > 0 ? 'text-red-400' : 'text-green-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
        <StatCard
          label="Commandes en attente"
          value={commandesEnAttente}
          color="bg-emerald-500/20"
          icon={<svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M6 7l1 11a2 2 0 002 2h6a2 2 0 002-2l1-11M9 7V5a3 3 0 016 0v2" /></svg>}
        />
        <StatCard
          label="Livraisons ce mois"
          value={receptionsMois}
          sub="receptions enregistrees"
          color="bg-green-500/20"
          icon={<svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
        />
        <StatCard
          label="Achats ce mois"
          value={formatMoney(montantMois)}
          color="bg-amber-500/20"
          icon={<svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {systemHealth && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Sante du systeme</h3>
              <p className="text-xs text-slate-500 mt-1">Connexion serveur, replica locale et sauvegardes automatiques.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={verifyLatestBackup}
                disabled={!isElectron || verifyingIntegrity}
                className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
              >
                {verifyingIntegrity ? 'Verification...' : 'Verifier l integrite'}
              </button>
              <button
                onClick={runImmediateAutoBackup}
                disabled={!isElectron || runningAutoBackup}
                className="text-xs text-sky-200 hover:text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
              >
                {runningAutoBackup ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
              </button>
            </div>
          </div>
          {systemHealth?.autoBackupOverdue && (
            <div className={`rounded-xl border px-4 py-4 ${systemHealth.autoBackupWarningLevel === 'red' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${systemHealth.autoBackupWarningLevel === 'red' ? 'text-red-200' : 'text-amber-200'}`}>
                    Sauvegarde automatique en retard
                  </div>
                  <div className={`text-sm mt-1 ${systemHealth.autoBackupWarningLevel === 'red' ? 'text-red-100' : 'text-amber-100'}`}>
                    La derniere sauvegarde auto date de {systemHealth.autoBackupDelayDays ?? '?'} jour{systemHealth.autoBackupDelayDays > 1 ? 's' : ''}. Lance une sauvegarde immediate pour securiser le cabinet.
                  </div>
                </div>
                <button
                  onClick={runImmediateAutoBackup}
                  disabled={!isElectron || runningAutoBackup}
                  className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${systemHealth.autoBackupWarningLevel === 'red' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'} disabled:opacity-50`}
                >
                  {runningAutoBackup ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <HealthPill label="Mode du poste" value={modeLabel} sub={systemHealth?.setupMode === 'client' ? 'Connecte au serveur du cabinet' : systemHealth?.setupMode === 'server' ? 'Ce poste porte la base de reference' : 'Base locale uniquement'} tone="sky" />
            <HealthPill label="Connexion serveur" value={connectionValue} sub={systemHealth?.setupMode === 'client' ? 'Retour automatique des que le serveur revient' : 'Pas de dependance reseau'} tone={connectionTone} />
            <HealthPill label="Replica locale" value={replicaValue} sub={systemHealth?.replicaLastSync ? `Derniere synchro: ${formatDateTime(systemHealth.replicaLastSync)}` : 'Aucune synchro disponible'} tone={replicaTone} />
            <HealthPill label="Derniere sauvegarde auto" value={latestBackup ? formatDateTime(latestBackup) : 'Aucune'} sub={`Hebdo: ${systemHealth?.lastWeeklyBackup ? formatDateTime(systemHealth.lastWeeklyBackup) : 'Aucune'} | Mensuelle: ${systemHealth?.lastMonthlyBackup ? formatDateTime(systemHealth.lastMonthlyBackup) : 'Aucune'}`} tone={latestBackup ? 'green' : 'amber'} />
            <HealthPill label="Mode d ecriture" value={writeModeValue} sub={systemHealth?.readOnly ? 'Les modifications sont bloquees tant que le serveur reste indisponible' : 'Les saisies sont immediatement persistantes'} tone={writeModeTone} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <HealthPill
              label="Etat des sauvegardes auto"
              value={systemHealth?.autoBackupOverdue ? 'Attention requise' : 'Cycle OK'}
              sub={systemHealth?.latestAutoBackup ? `Derniere auto: ${formatDateTime(systemHealth.latestAutoBackup)}` : 'Aucune sauvegarde auto detectee'}
              tone={backupTone}
            />
            <HealthPill
              label="Dernier controle d integrite"
              value={systemHealth?.lastIntegrityCheck ? (systemHealth.lastIntegrityCheck.ok ? 'Integrite OK' : 'Probleme detecte') : 'Non verifie'}
              sub={systemHealth?.lastIntegrityCheck ? `${formatDateTime(systemHealth.lastIntegrityCheck.checkedAt)} - ${systemHealth.lastIntegrityCheck.backupName}` : 'Lance un controle sur la sauvegarde la plus recente'}
              tone={integrityTone}
            />
          </div>
        </div>
      )}

      {monthly.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Depenses mensuelles (6 derniers mois)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={v => [`${moneyFormatter.format(v)} \u20ac`, 'Achats']}
              />
              <Bar dataKey="achats" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 gap-3">
            <h2 className="font-semibold text-white text-sm">Produits a commander</h2>
            <span className="text-xs text-red-400 font-medium bg-red-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
              {produitsAlerte.length} alerte{produitsAlerte.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-700/50">
            {produitsAlerte.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-500 text-sm">Tout le stock est OK</div>
            ) : (
              produitsAlerte.map(produit => (
                <div key={produit.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate" title={produit.nom}>
                      {produit.nom}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{produit.categorie}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-red-400 whitespace-nowrap tabular-nums">
                      {produit.stock_actuel} {produit.unite}
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">min. {produit.stock_minimum}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="font-semibold text-white text-sm">Dernieres receptions</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {dernieresReceptions.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-500 text-sm">Aucune reception enregistree</div>
            ) : (
              dernieresReceptions.map(reception => (
                <div key={reception.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate" title={reception.fournisseur_nom}>
                      {reception.fournisseur_nom}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {reception.reference_bl} - {new Date(reception.date).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-slate-300 whitespace-nowrap">
                      {reception.nb_produits} produit{reception.nb_produits > 1 ? 's' : ''}
                    </div>
                    {reception.montant_total > 0 && (
                      <div className="text-xs text-slate-500 whitespace-nowrap tabular-nums">
                        {formatMoney(reception.montant_total)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h2 className="font-semibold text-white text-sm">Commandes en cours</h2>
          </div>
          <div className="divide-y divide-slate-700/50">
            {commandesEnCours.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-500 text-sm">Aucune commande en attente</div>
            ) : (
              commandesEnCours.map(commande => (
                <div key={commande.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate" title={commande.fournisseur_nom}>
                      {commande.fournisseur_nom}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {commande.reference_commande || 'Sans reference'} - {commande.statut === 'PARTIELLE' ? 'partielle' : 'en attente'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-slate-300 whitespace-nowrap tabular-nums">
                      {formatMoney(commande.montant_total)}
                    </div>
                    <button
                      onClick={() => navigate(`/reception?commande=${commande.id}`)}
                      className="mt-2 text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Receptionner
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {(alertesPeremption.length > 0 || alertesLots.length > 0) && (
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 gap-3">
              <h2 className="font-semibold text-white text-sm">Peremptions proches</h2>
              <span className="text-xs text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                {alertesPeremption.length + alertesLots.length} alerte{alertesPeremption.length + alertesLots.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="divide-y divide-slate-700/50">
              {alertesPeremption.map(a => {
                const j = Math.round(a.jours_restants || 0)
                return (
                  <div key={`p-${a.id}`} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{a.nom}</div>
                      <div className="text-xs text-slate-500">Fiche produit</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold tabular-nums ${j <= 0 ? 'text-red-400' : j <= 30 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {j <= 0 ? 'Expire' : `${j}j`}
                      </div>
                      <div className="text-xs text-slate-500">{new Date(a.date_peremption).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                )
              })}
              {alertesLots.map((a, i) => {
                const j = Math.round(a.jours_restants || 0)
                return (
                  <div key={`l-${i}`} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">{a.nom}</div>
                      <div className="text-xs text-slate-500">Lot {a.lot || '?'} - {a.quantite} {a.unite}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold tabular-nums ${j <= 0 ? 'text-red-400' : j <= 30 ? 'text-amber-400' : 'text-slate-300'}`}>
                        {j <= 0 ? 'Expire' : `${j}j`}
                      </div>
                      <div className="text-xs text-slate-500">{new Date(a.date_expiration).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 gap-3">
          <h2 className="font-semibold text-white text-sm">Dernieres actions</h2>
          <button
            onClick={() => navigate('/journal')}
            className="text-xs text-orange-300 hover:text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            Ouvrir le journal
          </button>
        </div>
        <div className="divide-y divide-slate-700/50">
          {recentAudit.length === 0 ? (
            <div className="px-5 py-8 text-center text-slate-500 text-sm">Aucune action recente</div>
          ) : (
            recentAudit.map(entry => (
              <div key={entry.id} className="px-5 py-3 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate" title={entry.summary}>{entry.summary}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {entry.module || 'Journal'}{entry.actor_name ? ` - ${entry.actor_name}` : ''}
                  </div>
                </div>
                <div className="text-xs text-slate-500 shrink-0 whitespace-nowrap">
                  {formatDateTime(entry.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
