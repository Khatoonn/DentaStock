import { useEffect, useMemo, useRef, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
}

function createEmptyProductForm() {
  return {
    reference: '',
    nom: '',
    categorie: '',
    unite: 'unite',
    stock_actuel: 0,
    stock_minimum: 0,
    prix_unitaire: 0,
    fournisseur_id: '',
  }
}

function createEmptyCategoryForm() {
  return { nom: '', description: '' }
}

function buildCategoryRecords(categories, produits) {
  const byName = new Map(categories.map(c => [c.nom, c]))
  const names = new Set(categories.map(c => c.nom))
  produits.forEach(p => { if (p.categorie) names.add(p.categorie) })

  return [...names]
    .map(name => {
      const cat = byName.get(name)
      return {
        id: cat?.id || `local-${name}`,
        nom: name,
        description: cat?.description || '',
        nb_produits: produits.filter(p => p.categorie === name).length,
        persisted: Boolean(cat?.id),
      }
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

export default function Produits() {
  const sheetRef = useRef(null)

  // Data
  const [produits, setProduits] = useState([])
  const [archivedProduits, setArchivedProduits] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [categories, setCategories] = useState([])

  // UI state
  const [tab, setTab] = useState('actifs')
  const [filter, setFilter] = useState({ categorie: '', search: '', alerte: false })
  const [message, setMessage] = useState(null)

  // Product form (add/edit)
  const [productForm, setProductForm] = useState(createEmptyProductForm)
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [savingProduct, setSavingProduct] = useState(false)

  // Category form
  const [categoryForm, setCategoryForm] = useState(createEmptyCategoryForm)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [savingCategory, setSavingCategory] = useState(false)

  // Product detail sheet
  const [selectedId, setSelectedId] = useState(null)
  const [sheetForm, setSheetForm] = useState(null)
  const [savingSheet, setSavingSheet] = useState(false)
  const [productHistory, setProductHistory] = useState({ commandes: [], receptions: [] })
  const [loadingHistory, setLoadingHistory] = useState(false)

  const load = async () => {
    if (!isElectron) return
    const [nextProduits, nextArchived, nextFournisseurs, nextCategories] = await Promise.all([
      window.api.produitsList(),
      window.api.produitsListArchived(),
      window.api.fournisseursList(),
      window.api.categoriesList(),
    ])
    setProduits(nextProduits)
    setArchivedProduits(nextArchived)
    setFournisseurs(nextFournisseurs)
    setCategories(nextCategories)
  }

  useEffect(() => { load() }, [])

  // Derived
  const categoryRecords = useMemo(() => buildCategoryRecords(categories, produits), [categories, produits])
  const categoryNames = categoryRecords.map(c => c.nom)

  const filteredProduits = useMemo(() => {
    return produits.filter(p => {
      if (filter.alerte && Number(p.stock_actuel || 0) > Number(p.stock_minimum || 0)) return false
      if (filter.categorie && p.categorie !== filter.categorie) return false
      if (filter.search) {
        const q = filter.search.toLowerCase()
        const hay = [p.nom, p.reference, p.fournisseur_nom].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [filter, produits])

  const displayedProduits = tab === 'archives' ? archivedProduits : filteredProduits

  const stockStatus = p => {
    if (Number(p.stock_actuel || 0) <= 0) return { label: 'Epuise', cls: 'bg-red-500/20 text-red-400' }
    if (Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)) return { label: 'Alerte', cls: 'bg-orange-500/20 text-orange-400' }
    return { label: 'OK', cls: 'bg-green-500/20 text-green-400' }
  }

  const flash = (tone, text) => {
    setMessage({ tone, text })
    clearTimeout(flash.t)
    flash.t = setTimeout(() => setMessage(null), 3200)
  }

  // --- Product CRUD ---
  const resetProductForm = () => { setProductForm(createEmptyProductForm()); setEditingProductId(null); setShowProductForm(false) }

  const openProductEditor = p => {
    setProductForm({
      reference: p.reference || '', nom: p.nom || '', categorie: p.categorie || '',
      unite: p.unite || 'unite', stock_actuel: Number(p.stock_actuel || 0),
      stock_minimum: Number(p.stock_minimum || 0), prix_unitaire: Number(p.prix_unitaire || 0),
      fournisseur_id: Number(p.fournisseur_id || '') || '',
    })
    setEditingProductId(p.id)
    setShowProductForm(true)
  }

  const saveProduct = async () => {
    if (!productForm.nom.trim()) return
    setSavingProduct(true)
    try {
      const payload = { ...productForm, categorie: productForm.categorie || null, fournisseur_id: productForm.fournisseur_id || null }
      if (editingProductId) {
        await window.api.produitsUpdate(editingProductId, payload)
      } else {
        await window.api.produitsAdd(payload)
      }
      await load()
      flash('success', editingProductId ? 'Produit mis a jour.' : 'Produit ajoute au catalogue.')
      resetProductForm()
    } catch (e) {
      flash('error', e.message || 'Impossible d enregistrer le produit.')
    } finally {
      setSavingProduct(false)
    }
  }

  const archiveProduct = async p => {
    if (!window.confirm(`Archiver "${p.nom}" ?`)) return
    try {
      await window.api.produitsArchive(p.id)
      if (selectedId === p.id) closeSheet()
      await load()
      flash('success', `"${p.nom}" archive.`)
    } catch (e) { flash('error', e.message) }
  }

  const restoreProduct = async p => {
    try {
      await window.api.produitsRestore(p.id)
      await load()
      flash('success', `"${p.nom}" restaure.`)
    } catch (e) { flash('error', e.message) }
  }

  const deleteProduct = async p => {
    if (!window.confirm(`Supprimer definitivement "${p.nom}" ? Irreversible.`)) return
    try {
      await window.api.produitsDelete(p.id)
      await load()
      flash('success', `"${p.nom}" supprime.`)
    } catch (e) { flash('error', e.message) }
  }

  // --- Category CRUD ---
  const resetCategoryForm = () => { setCategoryForm(createEmptyCategoryForm()); setEditingCategoryId(null); setShowCategoryForm(false) }

  const openCategoryEditor = cat => {
    setCategoryForm({ nom: cat.nom || '', description: cat.description || '' })
    setEditingCategoryId(cat.persisted ? cat.id : null)
    setShowCategoryForm(true)
  }

  const saveCategory = async () => {
    if (!categoryForm.nom.trim()) return
    setSavingCategory(true)
    try {
      const payload = { nom: categoryForm.nom.trim(), description: categoryForm.description.trim() }
      const cur = categories.find(c => c.id === editingCategoryId)
      if (editingCategoryId) {
        await window.api.categoriesUpdate(editingCategoryId, payload)
      } else {
        await window.api.categoriesAdd(payload)
      }
      if (cur && filter.categorie === cur.nom && cur.nom !== payload.nom) {
        setFilter(f => ({ ...f, categorie: payload.nom }))
      }
      await load()
      flash('success', editingCategoryId ? 'Categorie mise a jour.' : 'Categorie ajoutee.')
      resetCategoryForm()
    } catch (e) {
      flash('error', e.message || 'Impossible d enregistrer la categorie.')
    } finally {
      setSavingCategory(false)
    }
  }

  const deleteCategory = async cat => {
    if (!window.confirm(`Supprimer la categorie "${cat.nom}" ?`)) return
    try {
      if (cat.persisted) {
        await window.api.categoriesDelete(cat.id)
        await load()
      }
      if (filter.categorie === cat.nom) setFilter(f => ({ ...f, categorie: '' }))
      if (editingCategoryId === cat.id) resetCategoryForm()
      flash('success', `Categorie "${cat.nom}" supprimee.`)
    } catch (e) { flash('error', e.message) }
  }

  // --- Product detail sheet ---
  const openSheet = async p => {
    setSelectedId(p.id)
    setSheetForm({
      reference: p.reference || '', nom: p.nom || '', categorie: p.categorie || '',
      unite: p.unite || 'unite', stock_actuel: Number(p.stock_actuel || 0),
      stock_minimum: Number(p.stock_minimum || 0), prix_unitaire: Number(p.prix_unitaire || 0),
      fournisseur_id: p.fournisseur_id || null,
    })
    setProductHistory({ commandes: [], receptions: [] })
    requestAnimationFrame(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setLoadingHistory(true)
    try {
      const h = await window.api.produitsHistory(p.id)
      setProductHistory(h || { commandes: [], receptions: [] })
    } catch { setProductHistory({ commandes: [], receptions: [] }) }
    finally { setLoadingHistory(false) }
  }

  const closeSheet = () => { setSelectedId(null); setSheetForm(null) }

  const saveSheet = async () => {
    if (!sheetForm?.nom?.trim()) return
    setSavingSheet(true)
    try {
      await window.api.produitsUpdate(selectedId, {
        reference: sheetForm.reference || '', nom: sheetForm.nom.trim(),
        categorie: sheetForm.categorie || null, unite: sheetForm.unite || 'unite',
        stock_actuel: Number(sheetForm.stock_actuel || 0), stock_minimum: Number(sheetForm.stock_minimum || 0),
        prix_unitaire: Number(sheetForm.prix_unitaire || 0), fournisseur_id: sheetForm.fournisseur_id || null,
      })
      await load()
      const h = await window.api.produitsHistory(selectedId)
      setProductHistory(h || { commandes: [], receptions: [] })
      flash('success', 'Fiche produit mise a jour.')
    } catch (e) { flash('error', e.message) }
    finally { setSavingSheet(false) }
  }

  // Keep sheet form in sync with data
  useEffect(() => {
    if (!selectedId) return
    const p = produits.find(x => x.id === selectedId)
    if (!p) { closeSheet(); return }
    setSheetForm(f => f ? { ...f } : null)
  }, [produits, selectedId])

  return (
    <div className="space-y-6 w-full min-w-0">
      {message && (
        <div className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm border ${
          message.tone === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {message.tone === 'error'
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            }
          </svg>
          {message.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 flex-1 min-w-0">
            <input
              type="text"
              placeholder="Rechercher un produit, une reference..."
              value={filter.search}
              onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
              className="lg:col-span-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
            />
            <select
              value={filter.categorie}
              onChange={e => setFilter(f => ({ ...f, categorie: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Toutes categories</option>
              {categoryNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={filter.alerte} onChange={e => setFilter(f => ({ ...f, alerte: e.target.checked }))} className="rounded" />
              Alertes seulement
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { setCategoryForm(createEmptyCategoryForm()); setShowCategoryForm(c => !c || editingCategoryId !== null); setEditingCategoryId(null) }}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Categorie
            </button>
            <button
              onClick={() => { setProductForm(createEmptyProductForm()); setShowProductForm(c => !c || editingProductId !== null); setEditingProductId(null) }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouveau produit
            </button>
          </div>
        </div>
      </div>

      {/* Layout: categories | table + sheet */}
      <div className="grid grid-cols-1 2xl:grid-cols-[280px_minmax(0,1fr)] gap-6 min-w-0">
        {/* Categories sidebar */}
        <div className="space-y-6 2xl:self-start">
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Categories</h3>
                <p className="text-xs text-slate-500 mt-1">Filtrer par famille</p>
              </div>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{categoryRecords.length}</span>
            </div>

            <div className="divide-y divide-slate-700/50">
              <button
                onClick={() => setFilter(f => ({ ...f, categorie: '' }))}
                className={`w-full text-left px-5 py-3.5 transition-colors ${!filter.categorie ? 'bg-emerald-500/10' : 'hover:bg-slate-700/30'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Tous les produits</div>
                  <span className="text-xs text-slate-400">{produits.length}</span>
                </div>
              </button>

              {categoryRecords.map(cat => (
                <div key={cat.id} className={filter.categorie === cat.nom ? 'bg-emerald-500/10' : ''}>
                  <div className="flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-slate-700/30 transition-colors">
                    <button onClick={() => setFilter(f => ({ ...f, categorie: cat.nom }))} className="flex-1 min-w-0 text-left">
                      <div className="text-sm font-medium text-white truncate">{cat.nom}</div>
                      <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cat.description || 'Aucune description'}</div>
                    </button>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-300">{cat.nb_produits} prod.</div>
                      {cat.persisted && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <button onClick={() => openCategoryEditor(cat)} className="text-xs text-emerald-300 hover:text-emerald-200">Modif.</button>
                          <button onClick={() => deleteCategory(cat)} className="text-xs text-red-300 hover:text-red-200">Suppr.</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showCategoryForm && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white">{editingCategoryId ? 'Modifier' : 'Ajouter'} une categorie</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
                  <input type="text" value={categoryForm.nom} onChange={e => setCategoryForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea value={categoryForm.description} onChange={e => setCategoryForm(f => ({ ...f, description: e.target.value }))}
                    rows={3} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-none" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button onClick={resetCategoryForm} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700">Annuler</button>
                <button onClick={saveCategory} disabled={savingCategory || !categoryForm.nom.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 rounded-lg">
                  {savingCategory ? '...' : editingCategoryId ? 'Mettre a jour' : 'Ajouter'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main content: product form + table + sheet */}
        <div className="space-y-6 min-w-0">
          {/* Add/edit product form */}
          {showProductForm && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-white">{editingProductId ? 'Modifier le produit' : 'Ajouter un produit'}</h3>
                <p className="text-xs text-slate-500 mt-1">Remplir les champs et enregistrer.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Reference</label>
                  <input type="text" value={productForm.reference} onChange={e => setProductForm(f => ({ ...f, reference: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-4">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
                  <input type="text" value={productForm.nom} onChange={e => setProductForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Categorie</label>
                  <select value={productForm.categorie} onChange={e => setProductForm(f => ({ ...f, categorie: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">-</option>
                    {categoryNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unite</label>
                  <input type="text" value={productForm.unite} onChange={e => setProductForm(f => ({ ...f, unite: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stock actuel</label>
                  <input type="number" min="0" value={productForm.stock_actuel} onChange={e => setProductForm(f => ({ ...f, stock_actuel: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Seuil alerte</label>
                  <input type="number" min="0" value={productForm.stock_minimum} onChange={e => setProductForm(f => ({ ...f, stock_minimum: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Prix HT</label>
                  <input type="number" min="0" step="0.01" value={productForm.prix_unitaire} onChange={e => setProductForm(f => ({ ...f, prix_unitaire: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div className="xl:col-span-4">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur</label>
                  <select value={productForm.fournisseur_id} onChange={e => setProductForm(f => ({ ...f, fournisseur_id: Number(e.target.value) || '' }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">- Aucun -</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={resetProductForm} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700">Annuler</button>
                <button onClick={saveProduct} disabled={savingProduct || !productForm.nom.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
                  {savingProduct ? 'Enregistrement...' : editingProductId ? 'Mettre a jour' : 'Ajouter'}
                </button>
              </div>
            </div>
          )}

          {/* Product table + detail sheet side by side */}
          <div className={`grid gap-6 min-w-0 ${selectedId ? 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
            {/* Table */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
              <div className="px-5 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div className="flex rounded-lg bg-slate-900/60 p-0.5">
                    <button onClick={() => setTab('actifs')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'actifs' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      Actifs ({filteredProduits.length})
                    </button>
                    <button onClick={() => setTab('archives')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'archives' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                      Archives ({archivedProduits.length})
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {tab === 'actifs'
                      ? `${filteredProduits.filter(p => Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)).length} en alerte`
                      : `${archivedProduits.length} archive${archivedProduits.length > 1 ? 's' : ''}`
                    }
                  </p>
                </div>
                {tab === 'actifs' && (
                  <button onClick={() => { setProductForm(createEmptyProductForm()); setEditingProductId(null); setShowProductForm(true) }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '16%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3 px-3">Ref</th>
                      <th className="text-left py-3 px-3">Produit</th>
                      <th className="text-left py-3 px-3">Categorie</th>
                      <th className="text-right py-3 px-3">Stock</th>
                      <th className="text-right py-3 px-3">Seuil</th>
                      <th className="text-right py-3 px-3">Prix HT</th>
                      <th className="text-left py-3 px-3">Fournisseur</th>
                      <th className="text-center py-3 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {displayedProduits.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                        {tab === 'archives' ? 'Aucun produit archive.' : 'Aucun produit trouve.'}
                      </td></tr>
                    ) : displayedProduits.map(p => {
                      const st = stockStatus(p)
                      const isSelected = selectedId === p.id
                      return (
                        <tr key={p.id} className={`transition-colors cursor-pointer ${isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-700/30'} ${tab === 'archives' ? 'opacity-70' : ''}`}
                          onClick={() => tab === 'actifs' && openSheet(p)}>
                          <td className="py-2.5 px-3 text-slate-400 font-mono text-xs truncate">{p.reference || '-'}</td>
                          <td className="py-2.5 px-3 font-medium text-white">
                            <div className="truncate" title={p.nom}>{p.nom}</div>
                            <div className={`mt-0.5 inline-flex text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${tab === 'archives' ? 'bg-slate-700 text-slate-400' : st.cls}`}>
                              {tab === 'archives' ? 'Archive' : st.label}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {p.categorie
                              ? <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{p.categorie}</span>
                              : <span className="text-xs text-slate-500">-</span>
                            }
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-white tabular-nums">
                            {Number(p.stock_actuel || 0)} <span className="text-xs font-normal text-slate-400">{p.unite}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">{Number(p.stock_minimum || 0)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300 tabular-nums">{Number(p.prix_unitaire || 0) > 0 ? formatMoney(p.prix_unitaire) : '-'}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-xs truncate">{p.fournisseur_nom || '-'}</td>
                          <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                            {tab === 'actifs' ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => openProductEditor(p)} className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg" title="Modifier">Modifier</button>
                                <button onClick={() => archiveProduct(p)} className="text-slate-400 hover:text-amber-400 p-1" title="Archiver">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => restoreProduct(p)} className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-1 rounded-lg">Restaurer</button>
                                <button onClick={() => deleteProduct(p)} className="text-slate-400 hover:text-red-400 p-1" title="Supprimer">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Product detail sheet (side panel) */}
            {selectedId && sheetForm && (
              <div ref={sheetRef} className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4 min-w-0 xl:self-start xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Fiche produit</h3>
                    <div className="text-sm font-medium text-emerald-300 mt-1 break-words">{sheetForm.nom}</div>
                  </div>
                  <button onClick={closeSheet} className="text-slate-400 hover:text-white p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Reference</label>
                    <input type="text" value={sheetForm.reference} onChange={e => setSheetForm(f => ({ ...f, reference: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Nom</label>
                    <input type="text" value={sheetForm.nom} onChange={e => setSheetForm(f => ({ ...f, nom: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Stock</label>
                      <input type="number" min="0" value={sheetForm.stock_actuel} onChange={e => setSheetForm(f => ({ ...f, stock_actuel: Number(e.target.value) }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Seuil</label>
                      <input type="number" min="0" value={sheetForm.stock_minimum} onChange={e => setSheetForm(f => ({ ...f, stock_minimum: Number(e.target.value) }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Categorie</label>
                      <select value={sheetForm.categorie} onChange={e => setSheetForm(f => ({ ...f, categorie: e.target.value }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="">-</option>
                        {categories.map(c => <option key={c.id} value={c.nom}>{c.nom}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Unite</label>
                      <input type="text" value={sheetForm.unite} onChange={e => setSheetForm(f => ({ ...f, unite: e.target.value }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Prix HT</label>
                    <input type="number" min="0" step="0.01" value={sheetForm.prix_unitaire} onChange={e => setSheetForm(f => ({ ...f, prix_unitaire: Number(e.target.value) }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right" />
                  </div>
                </div>

                {/* History */}
                <div className="border-t border-slate-700 pt-4 space-y-3">
                  <h4 className="text-xs font-semibold text-white">Historique d'achat</h4>

                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                      <span className="text-xs font-medium text-white">Commandes</span>
                      <span className="text-xs text-slate-400">{productHistory.commandes.length}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-700/50">
                      {loadingHistory ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">Chargement...</div>
                      ) : productHistory.commandes.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">Aucune commande.</div>
                      ) : productHistory.commandes.map(c => (
                        <div key={`c-${c.commande_id}-${c.date_commande}`} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-white truncate">{c.fournisseur_nom || '-'}</span>
                            <span className="text-xs text-emerald-300 tabular-nums">{formatMoney(c.prix_unitaire)}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(c.date_commande).toLocaleDateString('fr-FR')} - {Number(c.quantite || 0)} un.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                      <span className="text-xs font-medium text-white">Receptions</span>
                      <span className="text-xs text-slate-400">{productHistory.receptions.length}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-700/50">
                      {loadingHistory ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">Chargement...</div>
                      ) : productHistory.receptions.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-500 text-center">Aucune reception.</div>
                      ) : productHistory.receptions.map(r => (
                        <div key={`r-${r.reception_id}-${r.date}`} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-white truncate">{r.fournisseur_nom || '-'}</span>
                            <span className="text-xs text-sky-300 tabular-nums">{formatMoney(r.prix_unitaire)}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(r.date).toLocaleDateString('fr-FR')} - {Number(r.quantite || 0)} un.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button onClick={() => archiveProduct(produits.find(x => x.id === selectedId))}
                    className="text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors">
                    Archiver
                  </button>
                  <button onClick={saveSheet} disabled={savingSheet}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
                    {savingSheet ? '...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
