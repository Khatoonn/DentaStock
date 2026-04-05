import { useEffect, useRef, useState } from 'react'

/**
 * Autocomplete input for product selection.
 * Searches by name or reference.
 *
 * Props:
 *  - produits: array of { id, nom, reference, unite, prix_unitaire, ... }
 *  - value: selected produit_id (number or '')
 *  - onChange: (produit) => void  — called with the full product object or null
 *  - placeholder: string
 */
export default function ProductSearchInput({ produits, value, onChange, placeholder = 'Rechercher un produit...' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Display name for current selection
  const selected = produits.find(p => p.id === value)

  // When value changes externally, update display
  useEffect(() => {
    if (selected && !open) {
      setQuery(`${selected.nom} (${selected.reference || ''})`)
    } else if (!value && !open) {
      setQuery('')
    }
  }, [value, selected, open])

  // Filter produits by query
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? produits
        .filter(p => (
          (p.nom || '').toLowerCase().includes(normalizedQuery) ||
          (p.reference || '').toLowerCase().includes(normalizedQuery) ||
          (p.code_barre || '').toLowerCase().includes(normalizedQuery)
        ))
        .sort((left, right) => {
          const leftExact = [left.nom, left.reference, left.code_barre].filter(Boolean).some(value => value.toLowerCase() === normalizedQuery) ? 1 : 0
          const rightExact = [right.nom, right.reference, right.code_barre].filter(Boolean).some(value => value.toLowerCase() === normalizedQuery) ? 1 : 0
          return rightExact - leftExact
        })
        .slice(0, 15)
    : produits.slice(0, 15)

  const exactMatch = normalizedQuery
    ? produits.find(p => [p.nom, p.reference, p.code_barre].filter(Boolean).some(value => value.toLowerCase() === normalizedQuery))
    : null

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIdx, open])

  const selectProduct = (p) => {
    setQuery(`${p.nom} (${p.reference || ''})`)
    setOpen(false)
    onChange(p)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (exactMatch) {
        selectProduct(exactMatch)
      } else if (filtered[highlightIdx]) {
        selectProduct(filtered[highlightIdx])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      // Restore display
      if (selected) setQuery(`${selected.nom} (${selected.reference || ''})`)
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlightIdx(0)
          // If clearing, reset selection
          if (!e.target.value.trim()) onChange(null)
        }}
        onFocus={() => {
          setOpen(true)
          // Select all text on focus for easy re-search
          if (selected) inputRef.current?.select()
        }}
        onBlur={() => {
          // Delay to allow click on list item
          setTimeout(() => {
            setOpen(false)
            if (selected) setQuery(`${selected.nom} (${selected.reference || ''})`)
            else setQuery('')
          }, 200)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 truncate"
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-52 overflow-y-auto"
        >
          {filtered.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectProduct(p) }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                i === highlightIdx ? 'bg-sky-600/30 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span className="font-medium">{p.nom}</span>
              {p.reference && <span className="text-slate-500 ml-2">({p.reference})</span>}
              {p.code_barre && <span className="text-slate-600 ml-2">[{p.code_barre}]</span>}
              {p.stock_actuel !== undefined && (
                <span className={`text-xs ml-2 ${p.stock_actuel <= (p.stock_minimum || 0) ? 'text-red-400' : 'text-slate-500'}`}>
                  Stock: {p.stock_actuel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl px-3 py-3 text-sm text-slate-500">
          Aucun produit trouve
        </div>
      )}
    </div>
  )
}
