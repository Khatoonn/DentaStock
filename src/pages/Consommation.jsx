import { useEffect, useState, useRef, useMemo } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const TYPES_SOINS = [
  'Consultation',
  'Detartrage',
  'Obturation composite',
  'Obturation amalgame',
  'Extraction simple',
  'Extraction complexe',
  'Devitalisation',
  'Couronne ceramique',
  'Pose implant',
  'Empreinte prothese',
  'Blanchiment',
  'Autre',
]

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  praticien_id: '',
  type_soin: '',
  patient_ref: '',
  notes: '',
  items: [],
}

// Composant recherche produit avec autocomplétion
function ProductSearch({ produits, value, onChange, exclude = [] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const inputRef = useRef(null)

  const selected = produits.find(p => p.id === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return produits.filter(p => !exclude.includes(p.id))
    const q = query.toLowerCase()
    return produits
      .filter(p => !exclude.includes(p.id))
      .filter(p =>
        (p.nom && p.nom.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q))
      )
  }, [produits, query, exclude])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (produit) => {
    onChange(produit.id)
    setQuery('')
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setQuery('')
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 w-full min-w-0 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5">
        <span className="text-sm text-white truncate flex-1">{selected.nom}</span>
        <button onClick={clear} className="text-slate-400 hover:text-red-400 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher un produit..."
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">Aucun produit trouve</div>
          ) : (
            filtered.slice(0, 20).map(p => (
              <button
                key={p.id}
                onClick={() => select(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors flex items-center justify-between gap-2"
              >
                <span className="text-white truncate">{p.nom}</span>
                <span className="text-xs text-slate-400 shrink-0 flex items-center gap-2">
                  {p.reference && <span>{p.reference}</span>}
                  <span className={p.stock_actuel <= (p.stock_minimum || 0) ? 'text-red-400' : ''}>
                    Stock: {p.stock_actuel}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function Consommation() {
  const [praticiens, setPraticiens] = useState([])
  const [produits, setProduits] = useState([])
  const [utilisations, setUtilisations] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = async () => {
    if (!isElectron) return
    const [nextPraticiens, nextProduits, nextUtilisations] = await Promise.all([
      window.api.praticiensList(),
      window.api.produitsList(),
      window.api.utilisationsList(),
    ])
    setPraticiens(nextPraticiens)
    setProduits(nextProduits)
    setUtilisations(nextUtilisations)
  }

  useEffect(() => { load() }, [])

  const applySoinSuggestion = async typeSoin => {
    setForm(current => ({ ...current, type_soin: typeSoin }))
    if (!isElectron) return

    const templates = await window.api.soinsByType(typeSoin)
    if (templates.length > 0) {
      setForm(current => ({
        ...current,
        type_soin: typeSoin,
        items: templates.map(t => ({ produit_id: t.produit_id, quantite: t.quantite_defaut })),
      }))
    }
  }

  const addItem = () => {
    setForm(current => ({
      ...current,
      items: [...current.items, { produit_id: '', quantite: 1 }],
    }))
  }

  const updateItem = (index, value) => {
    setForm(current => {
      const items = [...current.items]
      items[index] = value
      return { ...current, items }
    })
  }

  const removeItem = index => {
    setForm(current => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }))
  }

  const save = async () => {
    if (!form.date || form.items.length === 0) return
    if (form.items.some(item => !item.produit_id || item.quantite <= 0)) return

    setSaving(true)
    if (isElectron) await window.api.utilisationsAdd(form)
    setSaving(false)
    setSuccess(true)
    setForm(EMPTY_FORM)
    setShowForm(false)
    load()
    setTimeout(() => setSuccess(false), 3000)
  }

  const openDetail = async (id) => {
    if (!isElectron) return
    const data = await window.api.utilisationsGet(id)
    setDetail(data)
  }

  const excludedIds = form.items.map(i => i.produit_id).filter(Boolean)

  return (
    <div className="space-y-6 w-full min-w-0">
      {success && (
        <div className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 rounded-xl px-5 py-3 text-violet-300 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Consommation enregistree et stock decremente.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Consommation</h2>
          <p className="text-sm text-slate-400">
            {utilisations.length} saisie{utilisations.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setDetail(null) }}
          className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors sm:w-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Declarer une utilisation
        </button>
      </div>

      {/* Formulaire de création */}
      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
          <h3 className="font-semibold text-white">Saisie de consommation</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Praticien</label>
              <select
                value={form.praticien_id}
                onChange={e => setForm(f => ({ ...f, praticien_id: Number(e.target.value) }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">- Tous -</option>
                {praticiens.map(p => (
                  <option key={p.id} value={p.id}>Dr {p.prenom} {p.nom}</option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Type de soin</label>
              <select
                value={form.type_soin}
                onChange={e => applySoinSuggestion(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">- Selectionner -</option>
                {TYPES_SOINS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Ref. patient</label>
              <input
                type="text"
                value={form.patient_ref}
                onChange={e => setForm(f => ({ ...f, patient_ref: e.target.value }))}
                placeholder="P-XXX ou initiales"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-12">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div className="min-w-0">
                <span className="text-sm font-medium text-white">Produits utilises</span>
                {form.type_soin && (
                  <span className="inline-flex ml-0 sm:ml-2 mt-2 sm:mt-0 text-xs text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">
                    Suggestions disponibles pour {form.type_soin}
                  </span>
                )}
              </div>
              <button
                onClick={addItem}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter
              </button>
            </div>

            <div className="space-y-2">
              {form.items.length === 0 ? (
                <div className="border border-dashed border-slate-700 rounded-lg py-6 text-center text-xs text-slate-500">
                  Selectionnez un type de soin pour les suggestions automatiques, ou ajoutez manuellement.
                </div>
              ) : (
                form.items.map((item, index) => {
                  const produit = produits.find(p => p.id === item.produit_id) || {}
                  return (
                    <div
                      key={index}
                      className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.8fr)_110px_72px_auto_32px] gap-3 bg-slate-700/50 rounded-lg px-3 py-2 items-center"
                    >
                      <ProductSearch
                        produits={produits}
                        value={item.produit_id}
                        onChange={id => updateItem(index, { ...item, produit_id: id })}
                        exclude={excludedIds.filter(eid => eid !== item.produit_id)}
                      />

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.quantite}
                        onChange={e => updateItem(index, { ...item, quantite: Number(e.target.value) })}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white text-right"
                      />

                      <span className="text-xs text-slate-400 whitespace-nowrap">{produit.unite || 'u.'}</span>

                      <div className="flex items-center gap-2 justify-between xl:justify-end min-w-0">
                        {produit.stock_actuel !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                            produit.stock_actuel <= (produit.stock_minimum || 3)
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-slate-600 text-slate-400'
                          }`}>
                            Stock: {produit.stock_actuel}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => removeItem(index)}
                        className="text-slate-500 hover:text-red-400 transition-colors shrink-0 justify-self-end"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving || form.items.length === 0}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Valider la consommation'}
            </button>
          </div>
        </div>
      )}

      {/* Detail d'une consommation */}
      {detail && (
        <div className="bg-slate-800 rounded-xl border border-violet-500/30 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              Detail - {detail.type_soin || 'Soin non precise'}
              {detail.patient_ref && <span className="ml-2 text-sm text-slate-400">({detail.patient_ref})</span>}
            </h3>
            <button
              onClick={() => setDetail(null)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-400">Date</span>
              <div className="text-white">{new Date(detail.date).toLocaleDateString('fr-FR')}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Praticien</span>
              <div className="text-white">
                {detail.praticien_prenom ? `Dr ${detail.praticien_prenom} ${detail.praticien_nom}` : '-'}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Type de soin</span>
              <div className="text-white">{detail.type_soin || '-'}</div>
            </div>
            <div>
              <span className="text-xs text-slate-400">Ref. patient</span>
              <div className="text-white">{detail.patient_ref || '-'}</div>
            </div>
          </div>

          {detail.notes && (
            <div>
              <span className="text-xs text-slate-400">Notes</span>
              <div className="text-sm text-white">{detail.notes}</div>
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-slate-400">Produits consommes</span>
            <div className="mt-2 divide-y divide-slate-700/50 rounded-lg border border-slate-700 overflow-hidden">
              {(detail.items || []).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-slate-700/30">
                  <div className="min-w-0">
                    <span className="text-sm text-white">{item.produit_nom || 'Produit inconnu'}</span>
                    {item.reference && <span className="ml-2 text-xs text-slate-500">{item.reference}</span>}
                  </div>
                  <span className="text-sm text-violet-300 shrink-0">
                    {item.quantite} {item.unite || 'u.'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-white">Historique des consommations</h3>
        </div>

        <div className="divide-y divide-slate-700/50">
          {utilisations.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">Aucune consommation enregistree</div>
          ) : (
            utilisations.map(u => (
              <button
                key={u.id}
                onClick={() => { openDetail(u.id); setShowForm(false) }}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors text-left"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-white text-sm truncate">
                      {u.type_soin || 'Soin non precise'}
                      {u.patient_ref && <span className="ml-2 text-xs text-slate-400">- {u.patient_ref}</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {u.praticien_prenom && `Dr ${u.praticien_prenom} ${u.praticien_nom} - `}
                      {new Date(u.date).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-slate-400 whitespace-nowrap shrink-0">
                  {u.nb_produits} produit{u.nb_produits > 1 ? 's' : ''}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
