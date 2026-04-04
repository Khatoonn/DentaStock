import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
}

const DEMO_MONTHLY = [
  { mois: 'Nov 2025', total: 3250.40 },
  { mois: 'Dec 2025', total: 2180.60 },
  { mois: 'Jan 2026', total: 2890.30 },
  { mois: 'Fev 2026', total: 1950.80 },
  { mois: 'Mar 2026', total: 3420.70 },
  { mois: 'Avr 2026', total: 1847.50 },
]

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
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
  const [stats, setStats] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isElectron) {
      Promise.all([
        window.api.statsDashboard(),
        window.api.statsMonthly(),
      ]).then(([s, m]) => { setStats(s); setMonthly(m) }).finally(() => setLoading(false))
    } else {
      setTimeout(() => {
        setStats(DEMO_STATS)
        setMonthly(DEMO_MONTHLY)
        setLoading(false)
      }, 300)
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
  } = stats

  return (
    <div className="space-y-6 w-full min-w-0">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
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
      </div>
    </div>
  )
}
