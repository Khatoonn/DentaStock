import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (!query.trim() || !isElectron) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await window.api.searchGlobal(query.trim())
        const flat = []
        if (r?.produits) r.produits.forEach(p => flat.push({ type: 'produit', id: p.id, nom: p.nom, detail: `${p.reference || ''} - ${p.categorie || 'Sans categorie'} - Stock: ${p.stock_actuel} ${p.unite || ''}` }))
        if (r?.fournisseurs) r.fournisseurs.forEach(f => flat.push({ type: 'fournisseur', id: f.id, nom: f.nom, detail: f.contact_commercial || f.email || '' }))
        if (r?.praticiens) r.praticiens.forEach(p => flat.push({ type: 'praticien', id: p.id, nom: `${p.prenom ? `${p.prenom} ` : ''}${p.nom}`.trim(), detail: p.role || '' }))
        if (r?.commandes) r.commandes.forEach(c => flat.push({ type: 'commande', id: c.id, nom: c.reference_commande || `Commande #${c.id}`, detail: `${c.fournisseur_nom || ''} - ${c.statut}` }))
        setResults(flat)
      } catch { setResults([]) }
      setLoading(false)
    }, 250)
  }, [query])

  const goTo = (item) => {
    setOpen(false)
    if (item.type === 'produit') navigate(`/produits?produit=${item.id}`)
    else if (item.type === 'fournisseur') navigate(`/fournisseurs?fournisseur=${item.id}`)
    else if (item.type === 'praticien') navigate(`/praticiens?praticien=${item.id}`)
    else if (item.type === 'commande') navigate(`/reception?commande=${item.id}`)
  }

  const typeLabels = { produit: 'Produit', fournisseur: 'Fournisseur', praticien: 'Praticien', commande: 'Commande' }
  const typeColors = {
    produit: 'bg-sky-500/20 text-sky-400',
    fournisseur: 'bg-rose-500/20 text-rose-400',
    praticien: 'bg-teal-500/20 text-teal-400',
    commande: 'bg-amber-500/20 text-amber-300',
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-400 text-xs transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Rechercher...
        <kbd className="hidden sm:inline text-[10px] bg-slate-600 px-1.5 py-0.5 rounded font-mono">Ctrl+K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <svg className="w-5 h-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher produits, fournisseurs, praticiens, commandes..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-500"
          />
          <kbd className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded font-mono">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && <div className="px-4 py-6 text-center text-slate-500 text-sm">Recherche...</div>}
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">Aucun resultat pour "{query}"</div>
          )}
          {!loading && results.map((item, i) => (
            <button
              key={`${item.type}-${item.id}-${i}`}
              onClick={() => goTo(item)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 transition-colors text-left"
            >
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${typeColors[item.type] || ''}`}>
                {typeLabels[item.type] || item.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{item.nom}</div>
                {item.detail && <div className="text-xs text-slate-400 truncate">{item.detail}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
