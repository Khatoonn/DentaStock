import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16']

const moneyFormatter = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function formatMoney(v) { return `${moneyFormatter.format(Number(v || 0))} \u20ac` }

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
        <div className="text-sm text-slate-400">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`bg-slate-800 rounded-xl border border-slate-700 p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm text-white">
          <span style={{ color: p.color }}>{p.name}</span>: {typeof p.value === 'number' && p.name?.includes('€') ? formatMoney(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

export default function Statistiques() {
  const [monthly, setMonthly] = useState([])
  const [topProduits, setTopProduits] = useState([])
  const [parCategorie, setParCategorie] = useState([])
  const [parFournisseur, setParFournisseur] = useState([])
  const [alertesPeremption, setAlertesPeremption] = useState([])
  const [valeurStock, setValeurStock] = useState({ nb_produits: 0, valeur_totale: 0, nb_alertes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isElectron) { setLoading(false); return }
    Promise.all([
      window.api.statsMonthly(),
      window.api.statsTopProduits(),
      window.api.statsParCategorie(),
      window.api.statsParFournisseur(),
      window.api.statsAlertesPeremption(),
      window.api.statsValeurStock(),
    ]).then(([m, tp, pc, pf, ap, vs]) => {
      setMonthly(m)
      setTopProduits(tp)
      setParCategorie(pc)
      setParFournisseur(pf)
      setAlertesPeremption(ap)
      setValeurStock(vs)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Chargement des statistiques...</div>

  const pieData = parCategorie.map((c, i) => ({
    name: c.categorie,
    value: Math.round(c.valeur_stock * 100) / 100,
    fill: COLORS[i % COLORS.length],
  })).filter(d => d.value > 0)

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Produits references" value={valeurStock.nb_produits} color="bg-sky-500/20"
          icon={<svg className="w-6 h-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
        <StatCard label="Valeur du stock" value={formatMoney(valeurStock.valeur_totale)} color="bg-emerald-500/20"
          icon={<svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard label="Alertes stock" value={valeurStock.nb_alertes}
          color={valeurStock.nb_alertes > 0 ? 'bg-red-500/20' : 'bg-green-500/20'}
          icon={<svg className={`w-6 h-6 ${valeurStock.nb_alertes > 0 ? 'text-red-400' : 'text-green-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard label="Alertes peremption" value={alertesPeremption.length}
          color={alertesPeremption.length > 0 ? 'bg-amber-500/20' : 'bg-green-500/20'}
          sub={alertesPeremption.length > 0 ? 'Dans les 90 prochains jours' : 'Aucune alerte'}
          icon={<svg className={`w-6 h-6 ${alertesPeremption.length > 0 ? 'text-amber-400' : 'text-green-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Depenses mensuelles (6 derniers mois)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="achats" name="Achats €" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Activite mensuelle">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="receptions" name="Receptions" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="consommations" name="Consommations" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Valeur du stock par categorie">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={true}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={v => formatMoney(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-slate-500 text-sm">Aucune donnee de stock</div>
          )}
        </ChartCard>

        <ChartCard title="Top 10 produits les plus consommes (6 mois)">
          {topProduits.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProduits} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis type="category" dataKey="nom" width={140} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total_consomme" name="Quantite consommee" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-slate-500 text-sm">Aucune consommation enregistree</div>
          )}
        </ChartCard>
      </div>

      {/* Fournisseurs & Péremption */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Achats par fournisseur (6 mois)">
          {parFournisseur.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={parFournisseur.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="nom" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total_achats" name="Total achats €" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-slate-500 text-sm">Aucun achat enregistre</div>
          )}
        </ChartCard>

        <ChartCard title="Alertes peremption (90 jours)">
          <div className="max-h-64 overflow-y-auto">
            {alertesPeremption.length === 0 ? (
              <div className="flex items-center justify-center h-60 text-slate-500 text-sm">Aucun produit proche de la peremption</div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {alertesPeremption.map(p => {
                  const days = Math.ceil((new Date(p.date_peremption) - new Date()) / 86400000)
                  const urgent = days <= 30
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2.5 px-1">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{p.nom}</div>
                        <div className="text-xs text-slate-400">{p.reference} - Stock: {p.stock_actuel} {p.unite}</div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${urgent ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                        {days <= 0 ? 'Expire !' : `${days}j restants`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ChartCard>
      </div>
    </div>
  )
}
