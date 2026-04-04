import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined
const PAGE_SIZE = 25

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
    date_peremption: '',
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

  const { toast, confirm } = useToast()

  // UI state
  const [tab, setTab] = useState('actifs')
  const [filter, setFilter] = useState({ categorie: '', search: '', alerte: false })
  const [page, setPage] = useState(1)
  const [formErrors, setFormErrors] = useState({})

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
  const [prixHistory, setPrixHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [seuilInfo, setSeuilInfo] = useState(null)

  const load = async () => {
    if (!isElectron) {
      setProduits([
        { id: 1, reference: 'ANE-001', nom: 'Articaine 4% 1/100 000', categorie: 'Anesthesie', unite: 'boite', stock_actuel: 2, stock_minimum: 5, prix_unitaire: 28.50, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', date_peremption: '2026-04-18', taux_tva: 20 },
        { id: 2, reference: 'ANE-002', nom: 'Lidocaine 2% adrenalinee', categorie: 'Anesthesie', unite: 'boite', stock_actuel: 8, stock_minimum: 3, prix_unitaire: 22.00, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', taux_tva: 20 },
        { id: 3, reference: 'ANE-003', nom: 'Mepivacaine 3% sans vaso', categorie: 'Anesthesie', unite: 'boite', stock_actuel: 12, stock_minimum: 3, prix_unitaire: 25.00, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', taux_tva: 20 },
        { id: 4, reference: 'ANE-004', nom: 'Aiguilles 30G courtes (100)', categorie: 'Anesthesie', unite: 'boite', stock_actuel: 1, stock_minimum: 4, prix_unitaire: 12.50, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', taux_tva: 20 },
        { id: 6, reference: 'COM-001', nom: 'Composite A2 seringue 4g', categorie: 'Composite', unite: 'seringue', stock_actuel: 2, stock_minimum: 6, prix_unitaire: 18.90, fournisseur_id: 2, fournisseur_nom: 'Gacd', taux_tva: 20 },
        { id: 7, reference: 'COM-002', nom: 'Composite A3 seringue 4g', categorie: 'Composite', unite: 'seringue', stock_actuel: 14, stock_minimum: 6, prix_unitaire: 18.90, fournisseur_id: 2, fournisseur_nom: 'Gacd', taux_tva: 20 },
        { id: 9, reference: 'COM-004', nom: 'Adhesif mono-composant 5ml', categorie: 'Composite', unite: 'flacon', stock_actuel: 7, stock_minimum: 3, prix_unitaire: 42.00, fournisseur_id: 2, fournisseur_nom: 'Gacd', taux_tva: 20 },
        { id: 12, reference: 'EMP-001', nom: 'Alginate prise rapide 500g', categorie: 'Empreinte', unite: 'sachet', stock_actuel: 18, stock_minimum: 8, prix_unitaire: 9.80, fournisseur_id: 3, fournisseur_nom: 'Mega Dental', date_peremption: '2026-05-15', taux_tva: 20 },
        { id: 17, reference: 'END-001', nom: 'Limes K 25mm assorties', categorie: 'Endodontie', unite: 'blister', stock_actuel: 9, stock_minimum: 6, prix_unitaire: 8.00, fournisseur_id: 4, fournisseur_nom: 'Dental Express', taux_tva: 20 },
        { id: 22, reference: 'HYG-001', nom: 'Gants nitrile M (100)', categorie: 'Hygiene', unite: 'boite', stock_actuel: 3, stock_minimum: 10, prix_unitaire: 7.90, fournisseur_id: 5, fournisseur_nom: 'Promodentaire', taux_tva: 5.5 },
        { id: 24, reference: 'HYG-003', nom: 'Masques chirurgicaux (50)', categorie: 'Hygiene', unite: 'boite', stock_actuel: 0, stock_minimum: 6, prix_unitaire: 5.50, fournisseur_id: 5, fournisseur_nom: 'Promodentaire', taux_tva: 5.5 },
        { id: 29, reference: 'IMP-001', nom: 'Pilier implantaire titane', categorie: 'Implantologie', unite: 'unite', stock_actuel: 6, stock_minimum: 2, prix_unitaire: 85.00, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', taux_tva: 20 },
        { id: 35, reference: 'PRO-001', nom: 'Ciment provisoire 25g', categorie: 'Prothese', unite: 'tube', stock_actuel: 9, stock_minimum: 4, prix_unitaire: 11.00, fournisseur_id: 3, fournisseur_nom: 'Mega Dental', taux_tva: 20 },
        { id: 39, reference: 'CHI-002', nom: 'Fil suture resorbable 4/0', categorie: 'Chirurgie', unite: 'sachet', stock_actuel: 11, stock_minimum: 5, prix_unitaire: 6.80, fournisseur_id: 4, fournisseur_nom: 'Dental Express', taux_tva: 20 },
        { id: 42, reference: 'RAD-001', nom: 'Capteurs radio taille 2', categorie: 'Radiologie', unite: 'unite', stock_actuel: 8, stock_minimum: 4, prix_unitaire: 15.00, fournisseur_id: 1, fournisseur_nom: 'Henry Schein', taux_tva: 20 },
      ])
      setFournisseurs([
        { id: 1, nom: 'Henry Schein' }, { id: 2, nom: 'Gacd' }, { id: 3, nom: 'Mega Dental' },
        { id: 4, nom: 'Dental Express' }, { id: 5, nom: 'Promodentaire' },
      ])
      setCategories([
        { id: 1, nom: 'Anesthesie' }, { id: 2, nom: 'Composite' }, { id: 3, nom: 'Empreinte' },
        { id: 4, nom: 'Endodontie' }, { id: 5, nom: 'Hygiene' }, { id: 6, nom: 'Implantologie' },
        { id: 7, nom: 'Orthodontie' }, { id: 8, nom: 'Prothese' }, { id: 9, nom: 'Chirurgie' }, { id: 10, nom: 'Radiologie' },
      ])
      return
    }
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

  // Reset page on filter/tab change
  useEffect(() => { setPage(1) }, [filter, tab])

  const allDisplayed = tab === 'archives' ? archivedProduits : filteredProduits
  const totalPages = Math.ceil(allDisplayed.length / PAGE_SIZE)
  const displayedProduits = allDisplayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stockStatus = p => {
    if (Number(p.stock_actuel || 0) <= 0) return { label: 'Epuise', cls: 'bg-red-500/20 text-red-400' }
    if (Number(p.stock_actuel || 0) <= Number(p.stock_minimum || 0)) return { label: 'Alerte', cls: 'bg-orange-500/20 text-orange-400' }
    return { label: 'OK', cls: 'bg-green-500/20 text-green-400' }
  }

  // --- Product CRUD ---
  const resetProductForm = () => { setProductForm(createEmptyProductForm()); setEditingProductId(null); setShowProductForm(false); setFormErrors({}) }

  const openProductEditor = p => {
    setProductForm({
      reference: p.reference || '', nom: p.nom || '', categorie: p.categorie || '',
      unite: p.unite || 'unite', stock_actuel: Number(p.stock_actuel || 0),
      stock_minimum: Number(p.stock_minimum || 0), prix_unitaire: Number(p.prix_unitaire || 0),
      fournisseur_id: Number(p.fournisseur_id || '') || '',
      date_peremption: p.date_peremption || '',
    })
    setEditingProductId(p.id)
    setShowProductForm(true)
    setFormErrors({})
  }

  const saveProduct = async () => {
    const errors = {}
    if (!productForm.nom.trim()) errors.nom = 'Le nom est requis.'
    if (Object.keys(errors).length) { setFormErrors(errors); return }
    setFormErrors({})
    setSavingProduct(true)
    try {
      const payload = { ...productForm, categorie: productForm.categorie || null, fournisseur_id: productForm.fournisseur_id || null, date_peremption: productForm.date_peremption || null }
      if (editingProductId) {
        await window.api.produitsUpdate(editingProductId, payload)
      } else {
        await window.api.produitsAdd(payload)
      }
      await load()
      toast(editingProductId ? 'Produit mis a jour.' : 'Produit ajoute au catalogue.', 'success')
      resetProductForm()
    } catch (e) {
      toast(e.message || 'Impossible d enregistrer le produit.', 'error')
    } finally {
      setSavingProduct(false)
    }
  }

  const archiveProduct = async p => {
    if (!(await confirm(`Archiver "${p.nom}" ?`))) return
    try {
      await window.api.produitsArchive(p.id)
      if (selectedId === p.id) closeSheet()
      await load()
      toast(`"${p.nom}" archive.`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const restoreProduct = async p => {
    try {
      await window.api.produitsRestore(p.id)
      await load()
      toast(`"${p.nom}" restaure.`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const deleteProduct = async p => {
    if (!(await confirm(`Supprimer definitivement "${p.nom}" ? Irreversible.`))) return
    try {
      await window.api.produitsDelete(p.id)
      await load()
      toast(`"${p.nom}" supprime.`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const exportCsv = async () => {
    try {
      const result = await window.api.exportCsv('produits')
      if (result?.success) toast('Export CSV enregistre.', 'success')
      else toast('Export annule.', 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  const autoCommande = async () => {
    try {
      const result = await window.api.commandesAutoGenerate()
      toast(result?.message || 'Commandes generees.', 'success')
      await load()
    } catch (e) { toast(e.message, 'error') }
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
      toast(editingCategoryId ? 'Categorie mise a jour.' : 'Categorie ajoutee.', 'success')
      resetCategoryForm()
    } catch (e) {
      toast(e.message || 'Impossible d enregistrer la categorie.', 'error')
    } finally {
      setSavingCategory(false)
    }
  }

  const deleteCategory = async cat => {
    if (!(await confirm(`Supprimer la categorie "${cat.nom}" ?`))) return
    try {
      if (cat.persisted) {
        await window.api.categoriesDelete(cat.id)
        await load()
      }
      if (filter.categorie === cat.nom) setFilter(f => ({ ...f, categorie: '' }))
      if (editingCategoryId === cat.id) resetCategoryForm()
      toast(`Categorie "${cat.nom}" supprimee.`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  // --- Product detail sheet ---
  const openSheet = async p => {
    setSelectedId(p.id)
    setSheetForm({
      reference: p.reference || '', nom: p.nom || '', categorie: p.categorie || '',
      unite: p.unite || 'unite', stock_actuel: Number(p.stock_actuel || 0),
      stock_minimum: Number(p.stock_minimum || 0), prix_unitaire: Number(p.prix_unitaire || 0),
      fournisseur_id: p.fournisseur_id || null,
      date_peremption: p.date_peremption || '',
    })
    setProductHistory({ commandes: [], receptions: [] })
    setPrixHistory([])
    requestAnimationFrame(() => sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setLoadingHistory(true)
    try {
      const [h, ph] = await Promise.all([
        window.api.produitsHistory(p.id),
        window.api.prixHistorique(p.id),
      ])
      setProductHistory(h || { commandes: [], receptions: [] })
      setPrixHistory(ph || [])
    } catch { setProductHistory({ commandes: [], receptions: [] }); setPrixHistory([]) }
    finally { setLoadingHistory(false) }
  }

  const closeSheet = () => { setSelectedId(null); setSheetForm(null); setSeuilInfo(null) }

  const analyserSeuil = async () => {
    if (!selectedId || !isElectron) return
    try {
      const info = await window.api.produitsSeuilRecommande(selectedId)
      setSeuilInfo(info)
    } catch { setSeuilInfo({ message: 'Erreur lors de l\'analyse.' }) }
  }

  const appliquerSeuil = () => {
    if (seuilInfo?.recommandation && sheetForm) {
      setSheetForm(f => ({ ...f, stock_minimum: seuilInfo.recommandation }))
      toast(`Seuil mis a ${seuilInfo.recommandation} (a enregistrer).`, 'info')
    }
  }

  const saveSheet = async () => {
    if (!sheetForm?.nom?.trim()) return
    setSavingSheet(true)
    try {
      await window.api.produitsUpdate(selectedId, {
        reference: sheetForm.reference || '', nom: sheetForm.nom.trim(),
        categorie: sheetForm.categorie || null, unite: sheetForm.unite || 'unite',
        stock_actuel: Number(sheetForm.stock_actuel || 0), stock_minimum: Number(sheetForm.stock_minimum || 0),
        prix_unitaire: Number(sheetForm.prix_unitaire || 0), fournisseur_id: sheetForm.fournisseur_id || null,
        date_peremption: sheetForm.date_peremption || null,
      })
      await load()
      const [h, ph] = await Promise.all([window.api.produitsHistory(selectedId), window.api.prixHistorique(selectedId)])
      setProductHistory(h || { commandes: [], receptions: [] })
      setPrixHistory(ph || [])
      toast('Fiche produit mise a jour.', 'success')
    } catch (e) { toast(e.message, 'error') }
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
            <button onClick={autoCommande}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              Commande auto
            </button>
            <button onClick={exportCsv}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV
            </button>
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
                  <input type="text" value={productForm.nom} onChange={e => { setProductForm(f => ({ ...f, nom: e.target.value })); setFormErrors(e => ({ ...e, nom: undefined })) }}
                    className={`w-full bg-slate-700 border rounded-lg px-3 py-2 text-sm text-white ${formErrors.nom ? 'border-red-500' : 'border-slate-600'}`} />
                  {formErrors.nom && <p className="text-xs text-red-400 mt-1">{formErrors.nom}</p>}
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
                <div className="xl:col-span-3">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur</label>
                  <select value={productForm.fournisseur_id} onChange={e => setProductForm(f => ({ ...f, fournisseur_id: Number(e.target.value) || '' }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">- Aucun -</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Peremption</label>
                  <input type="date" value={productForm.date_peremption} onChange={e => setProductForm(f => ({ ...f, date_peremption: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
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
                <table className="w-full min-w-[1000px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '17%' }} />
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
                      <th className="text-center py-3 px-3">Peremption</th>
                      <th className="text-center py-3 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {displayedProduits.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-10 text-slate-500">
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
                          <td className="py-2.5 px-3 text-center text-xs">
                            {p.date_peremption ? (() => {
                              const d = new Date(p.date_peremption)
                              const diff = Math.ceil((d - new Date()) / 86400000)
                              const cls = diff <= 0 ? 'text-red-400 font-semibold' : diff <= 30 ? 'text-red-400' : diff <= 90 ? 'text-amber-400' : 'text-slate-400'
                              return <span className={cls}>{d.toLocaleDateString('fr-FR')}</span>
                            })() : <span className="text-slate-600">-</span>}
                          </td>
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
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-700">
                  <span className="text-xs text-slate-400">{allDisplayed.length} produit{allDisplayed.length > 1 ? 's' : ''} - Page {page}/{totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                      className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-colors">Precedent</button>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                      className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 transition-colors">Suivant</button>
                  </div>
                </div>
              )}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Peremption</label>
                    <input type="date" value={sheetForm.date_peremption} onChange={e => setSheetForm(f => ({ ...f, date_peremption: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
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

                  {prixHistory.length > 0 && (
                    <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                        <span className="text-xs font-medium text-white">Historique des prix</span>
                        <span className="text-xs text-slate-400">{prixHistory.length}</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto divide-y divide-slate-700/50">
                        {prixHistory.map((ph, i) => (
                          <div key={i} className="px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-white truncate">{ph.fournisseur_nom || '-'}</span>
                              <span className="text-xs text-violet-300 tabular-nums">{formatMoney(ph.prix_unitaire)}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(ph.date).toLocaleDateString('fr-FR')} - {ph.source}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Analyse seuil intelligent */}
                <div className="border-t border-slate-700 pt-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-semibold text-white">Seuil intelligent</h4>
                    <button onClick={analyserSeuil}
                      className="text-xs text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded-lg transition-colors">
                      Analyser
                    </button>
                  </div>
                  {seuilInfo && (
                    <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-3 space-y-2">
                      <p className="text-xs text-slate-300">{seuilInfo.message}</p>
                      {seuilInfo.recommandation != null && (
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-400">
                            <span>Conso moy: <strong className="text-white">{seuilInfo.moyenneMensuelle}/mois</strong></span>
                            <span className="ml-2">Delai: <strong className="text-white">~{seuilInfo.delaiLivraisonJours}j</strong></span>
                          </div>
                          <button onClick={appliquerSeuil}
                            className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg">
                            Appliquer ({seuilInfo.recommandation})
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Prix TTC */}
                {sheetForm.prix_unitaire > 0 && (
                  <div className="border-t border-slate-700 pt-3 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Prix HT</span>
                      <span className="text-white tabular-nums">{formatMoney(sheetForm.prix_unitaire)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span className="text-slate-400">TVA (20%)</span>
                      <span className="text-slate-300 tabular-nums">{formatMoney(sheetForm.prix_unitaire * 0.2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1 font-semibold">
                      <span className="text-slate-300">Prix TTC</span>
                      <span className="text-emerald-300 tabular-nums">{formatMoney(sheetForm.prix_unitaire * 1.2)}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button onClick={() => archiveProduct(produits.find(x => x.id === selectedId))}
                    className="text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 px-3 py-1.5 rounded-lg transition-colors">
                    Archiver
                  </button>
                  <button onClick={() => window.print()}
                    className="text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors" title="Imprimer la fiche">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
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
