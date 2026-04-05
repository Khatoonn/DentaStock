import { useEffect, useMemo, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const MODULE_LABELS = {
  PRODUITS: 'Produits',
  FOURNISSEURS: 'Fournisseurs',
  CATEGORIES: 'Categories',
  COMMANDES: 'Commandes',
  RECEPTIONS: 'Receptions',
  STOCK: 'Stock',
  CONSOMMATION: 'Consommation',
  PRATICIENS: 'Praticiens',
  PROFILS: 'Operateurs',
  OPERATEURS: 'Operateurs',
  RETOURS: 'Retours',
  REMISES: 'Remises',
}

const DEMO_ENTRIES = [
  { id: 1, module: 'PRODUITS', action: 'UPDATE', target_label: 'Gants nitrile M', summary: 'Fiche produit "Gants nitrile M" mise a jour.', details: 'Stock: 8 -> 12 - Seuil: 4 -> 6', actor_name: 'Administrateur', actor_role: 'ADMIN', workstation: 'POSTE-ACCUEIL', created_at: '2026-04-05 09:12:00' },
  { id: 2, module: 'COMMANDES', action: 'CREATE', target_label: 'CMD-2026-041', summary: 'Commande CMD-2026-041 enregistree.', details: '3 ligne(s) - fournisseur #2.', actor_name: 'Claire', actor_role: 'EQUIPE', workstation: 'POSTE-STOCK', created_at: '2026-04-05 08:48:00' },
  { id: 3, module: 'RECEPTIONS', action: 'APPEND', target_label: 'BL-2026-122', summary: 'Reception partielle ajoutee a BL-2026-122.', details: '2 ligne(s) sur un passage supplementaire.', actor_name: 'Claire', actor_role: 'EQUIPE', workstation: 'POSTE-STOCK', created_at: '2026-04-04 16:15:00' },
]

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Journal() {
  const [entries, setEntries] = useState([])
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      if (!isElectron) {
        setEntries(DEMO_ENTRIES)
        setLoading(false)
        return
      }

      try {
        const rows = await window.api.auditList({
          limit: 150,
          module: moduleFilter || null,
          search,
        })

        if (!cancelled) {
          setEntries(rows || [])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const timeout = window.setTimeout(() => {
      void load()
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [moduleFilter, search])

  const moduleOptions = useMemo(() => {
    const fromData = new Set(entries.map(entry => entry.module).filter(Boolean))
    Object.keys(MODULE_LABELS).forEach(key => fromData.add(key))
    return Array.from(fromData).sort()
  }, [entries])

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3 flex-1 min-w-0">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher une action, un produit, un fournisseur, un utilisateur..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
            />
            <select
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white"
            >
              <option value="">Tous les modules</option>
              {moduleOptions.map(option => (
                <option key={option} value={option}>
                  {MODULE_LABELS[option] || option}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-400">
            {entries.length} action{entries.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Derniere action</div>
          <div className="text-sm font-medium text-white mt-2">
            {entries[0]?.summary || 'Aucune action'}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Utilisateur</div>
          <div className="text-sm font-medium text-white mt-2">
            {entries[0]?.actor_name || '-'}
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Horodatage</div>
          <div className="text-sm font-medium text-white mt-2">
            {entries[0] ? formatDateTime(entries[0].created_at) : '-'}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Historique des modifications</h2>
          <div className="text-xs text-slate-500">Tri du plus recent au plus ancien</div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Chargement du journal...</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">Aucune action ne correspond aux filtres.</div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {entries.map(entry => (
              <div key={entry.id} className="px-5 py-4 hover:bg-slate-700/20 transition-colors">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-slate-700 text-slate-200">
                        {MODULE_LABELS[entry.module] || entry.module}
                      </span>
                      {entry.action && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-sky-500/10 text-sky-300">
                          {entry.action}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-white mt-2 break-words">
                      {entry.summary}
                    </div>
                    {entry.target_label && (
                      <div className="text-xs text-slate-400 mt-1 break-words">
                        Cible : {entry.target_label}
                      </div>
                    )}
                    {entry.details && (
                      <div className="text-xs text-slate-500 mt-2 break-words">
                        {entry.details}
                      </div>
                    )}
                  </div>
                  <div className="text-left xl:text-right shrink-0">
                    <div className="text-sm text-slate-200">{entry.actor_name || 'Systeme'}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {(entry.actor_role || '-')} {entry.workstation ? `- ${entry.workstation}` : ''}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
