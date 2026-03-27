import { useLocation } from 'react-router-dom'

const titles = {
  '/dashboard': { label: 'Tableau de bord', desc: 'Vue generale du stock et des activites' },
  '/reception': { label: 'Reception', desc: 'Commandes fournisseurs, attentes et livraisons' },
  '/stock': { label: 'Stock', desc: 'Rechercher un produit et corriger manuellement le stock' },
  '/commandes': { label: 'Reception', desc: 'Commandes fournisseurs, attentes et livraisons' },
  '/consommation': { label: 'Consommation', desc: 'Declarer les produits utilises' },
  '/documents': { label: 'Documents / GED', desc: 'Bons de livraison et factures fournisseurs' },
  '/produits': { label: 'Catalogue produits', desc: 'Gerer le catalogue et les seuils de stock' },
  '/fournisseurs': { label: 'Fournisseurs', desc: 'Gerer les fournisseurs et leurs contacts' },
  '/parametres': { label: 'Parametres', desc: 'Configurer le stockage partage et les archives' },
}

const isElectron = typeof window !== 'undefined' && window.api !== undefined

export default function Header() {
  const location = useLocation()
  const info = titles[location.pathname] || { label: 'DentaStock', desc: '' }
  const now = new Date()
  const dateStr = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <header className="drag-region flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
      <div className="flex flex-col">
        <h1 className="text-base font-semibold text-white leading-tight">{info.label}</h1>
        <p className="text-xs text-slate-400">{info.desc}</p>
      </div>

      <div className="no-drag flex items-center gap-4">
        <span className="text-xs text-slate-400 capitalize">{dateStr}</span>

        {isElectron && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => window.api.windowMinimize()}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Reduire"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={() => window.api.windowMaximize()}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Agrandir"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth={2} />
              </svg>
            </button>
            <button
              onClick={() => window.api.windowClose()}
              className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
              title="Fermer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
