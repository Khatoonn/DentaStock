import { useEffect, useMemo, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_PRODUITS = [
  { id: 1, reference: 'GANT-001', nom: 'Gants nitrile M', categorie: null, unite: 'boite', stock_actuel: 8, stock_minimum: 2, prix_unitaire: 11.5, fournisseur_id: null, fournisseur_nom: null },
  { id: 2, reference: 'ANES-001', nom: 'Carpules d articaine 1/100 000', categorie: null, unite: 'boite', stock_actuel: 6, stock_minimum: 2, prix_unitaire: 29.0, fournisseur_id: null, fournisseur_nom: null },
]

const DEMO_FOURNISSEURS = []

const DEMO_CATEGORIES = []

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
  return {
    nom: '',
    description: '',
  }
}

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
}

function buildCategoryRecords(categories, produits) {
  const byName = new Map(categories.map(category => [category.nom, category]))
  const names = new Set(categories.map(category => category.nom))

  produits.forEach(produit => {
    if (produit.categorie) {
      names.add(produit.categorie)
    }
  })

  return [...names]
    .map(name => {
      const category = byName.get(name)
      const nbProduits = produits.filter(produit => produit.categorie === name).length

      return {
        id: category?.id || `local-${name}`,
        nom: name,
        description: category?.description || '',
        nb_produits: nbProduits,
        persisted: Boolean(category?.id),
      }
    })
    .sort((left, right) => left.nom.localeCompare(right.nom, 'fr'))
}

export default function Produits() {
  const [produits, setProduits] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [categories, setCategories] = useState([])
  const [productForm, setProductForm] = useState(createEmptyProductForm)
  const [categoryForm, setCategoryForm] = useState(createEmptyCategoryForm)
  const [showProductForm, setShowProductForm] = useState(false)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [message, setMessage] = useState(null)
  const [filter, setFilter] = useState({ categorie: '', search: '', alerte: false })

  const load = async () => {
    if (isElectron) {
      const [nextProduits, nextFournisseurs, nextCategories] = await Promise.all([
        window.api.produitsList(),
        window.api.fournisseursList(),
        window.api.categoriesList(),
      ])

      setProduits(nextProduits)
      setFournisseurs(nextFournisseurs)
      setCategories(nextCategories)
      return
    }

    setProduits(DEMO_PRODUITS)
    setFournisseurs(DEMO_FOURNISSEURS)
    setCategories(DEMO_CATEGORIES)
  }

  useEffect(() => {
    load()
  }, [])

  const categoryRecords = useMemo(() => buildCategoryRecords(categories, produits), [categories, produits])
  const categoryNames = categoryRecords.map(category => category.nom)

  const filteredProduits = useMemo(() => {
    return produits.filter(produit => {
      if (filter.alerte && Number(produit.stock_actuel || 0) > Number(produit.stock_minimum || 0)) {
        return false
      }

      if (filter.categorie && produit.categorie !== filter.categorie) {
        return false
      }

      if (filter.search) {
        const query = filter.search.toLowerCase()
        const haystack = [produit.nom, produit.reference, produit.fournisseur_nom]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [filter, produits])

  const stockStatus = produit => {
    if (Number(produit.stock_actuel || 0) <= 0) return { label: 'Epuise', cls: 'bg-red-500/20 text-red-400' }
    if (Number(produit.stock_actuel || 0) <= Number(produit.stock_minimum || 0)) return { label: 'Alerte', cls: 'bg-orange-500/20 text-orange-400' }
    return { label: 'OK', cls: 'bg-green-500/20 text-green-400' }
  }

  const clearMessageLater = nextMessage => {
    setMessage(nextMessage)
    window.clearTimeout(clearMessageLater.timer)
    clearMessageLater.timer = window.setTimeout(() => setMessage(null), 3200)
  }

  const resetProductForm = () => {
    setProductForm(createEmptyProductForm())
    setEditingProductId(null)
    setShowProductForm(false)
  }

  const resetCategoryForm = () => {
    setCategoryForm(createEmptyCategoryForm())
    setEditingCategoryId(null)
    setShowCategoryForm(false)
  }

  const openProductEditor = produit => {
    setProductForm({
      reference: produit.reference || '',
      nom: produit.nom || '',
      categorie: produit.categorie || '',
      unite: produit.unite || 'unite',
      stock_actuel: Number(produit.stock_actuel || 0),
      stock_minimum: Number(produit.stock_minimum || 0),
      prix_unitaire: Number(produit.prix_unitaire || 0),
      fournisseur_id: Number(produit.fournisseur_id || '') || '',
    })
    setEditingProductId(produit.id)
    setShowProductForm(true)
  }

  const openCategoryEditor = category => {
    setCategoryForm({
      nom: category.nom || '',
      description: category.description || '',
    })
    setEditingCategoryId(category.persisted ? category.id : null)
    setShowCategoryForm(true)
  }

  const saveProduct = async () => {
    if (!productForm.nom.trim()) return

    setSavingProduct(true)

    try {
      const payload = {
        ...productForm,
        categorie: productForm.categorie || null,
        fournisseur_id: productForm.fournisseur_id || null,
      }

      if (isElectron) {
        if (editingProductId) {
          await window.api.produitsUpdate(editingProductId, payload)
        } else {
          await window.api.produitsAdd(payload)
        }
      }

      await load()
      clearMessageLater({
        tone: 'success',
        text: editingProductId ? 'Produit mis a jour.' : 'Produit ajoute au catalogue.',
      })
      resetProductForm()
    } catch (error) {
      clearMessageLater({
        tone: 'error',
        text: error.message || 'Impossible d enregistrer le produit.',
      })
    } finally {
      setSavingProduct(false)
    }
  }

  const saveCategory = async () => {
    if (!categoryForm.nom.trim()) return

    setSavingCategory(true)

    try {
      const payload = {
        nom: categoryForm.nom.trim(),
        description: categoryForm.description.trim(),
      }

      const currentCategory = categories.find(category => category.id === editingCategoryId)

      if (isElectron) {
        if (editingCategoryId) {
          await window.api.categoriesUpdate(editingCategoryId, payload)
        } else {
          await window.api.categoriesAdd(payload)
        }
      }

      if (currentCategory && filter.categorie === currentCategory.nom && currentCategory.nom !== payload.nom) {
        setFilter(current => ({ ...current, categorie: payload.nom }))
      }

      await load()
      clearMessageLater({
        tone: 'success',
        text: editingCategoryId ? 'Categorie mise a jour.' : 'Categorie ajoutee.',
      })
      resetCategoryForm()
    } catch (error) {
      clearMessageLater({
        tone: 'error',
        text: error.message || 'Impossible d enregistrer la categorie.',
      })
    } finally {
      setSavingCategory(false)
    }
  }

  const deleteCategory = async category => {
    const confirmed = window.confirm(
      `Supprimer la categorie "${category.nom}" ? Les produits rattaches resteront dans le catalogue et passeront en non classe.`
    )

    if (!confirmed) return

    try {
      if (isElectron && category.persisted) {
        await window.api.categoriesDelete(category.id)
        await load()
      } else {
        setCategories(current => current.filter(item => item.id !== category.id))
        setProduits(current =>
          current.map(produit =>
            produit.categorie === category.nom
              ? { ...produit, categorie: null }
              : produit
          )
        )
      }

      if (filter.categorie === category.nom) {
        setFilter(current => ({ ...current, categorie: '' }))
      }

      if (editingCategoryId === category.id) {
        resetCategoryForm()
      }

      clearMessageLater({
        tone: 'success',
        text: `Categorie "${category.nom}" supprimee.`,
      })
    } catch (error) {
      clearMessageLater({
        tone: 'error',
        text: error.message || 'Impossible de supprimer la categorie.',
      })
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {message && (
        <div className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm border ${
          message.tone === 'error'
            ? 'bg-red-500/10 border-red-500/30 text-red-300'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        }`}>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {message.tone === 'error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            )}
          </svg>
          {message.text}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 flex-1 min-w-0">
            <input
              type="text"
              placeholder="Rechercher un produit, une reference ou un fournisseur..."
              value={filter.search}
              onChange={e => setFilter(current => ({ ...current, search: e.target.value }))}
              className="lg:col-span-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
            />

            <select
              value={filter.categorie}
              onChange={e => setFilter(current => ({ ...current, categorie: e.target.value }))}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Toutes categories</option>
              {categoryNames.map(categoryName => (
                <option key={categoryName} value={categoryName}>
                  {categoryName}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={filter.alerte}
                onChange={e => setFilter(current => ({ ...current, alerte: e.target.checked }))}
                className="rounded"
              />
              Alertes seulement
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                setCategoryForm(createEmptyCategoryForm())
                setShowCategoryForm(current => !current || editingCategoryId !== null)
                setEditingCategoryId(null)
              }}
              className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle categorie
            </button>

            <button
              onClick={() => {
                setProductForm(createEmptyProductForm())
                setShowProductForm(current => !current || editingProductId !== null)
                setEditingProductId(null)
              }}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau produit
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[320px_minmax(0,1fr)] gap-6 min-w-0">
        <div className="space-y-6 2xl:self-start">
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Categories</h3>
                <p className="text-xs text-slate-500 mt-1">Classe le catalogue par familles de produits.</p>
              </div>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                {categoryRecords.length}
              </span>
            </div>

            <div className="divide-y divide-slate-700/50">
              <button
                onClick={() => setFilter(current => ({ ...current, categorie: '' }))}
                className={`w-full text-left px-5 py-4 transition-colors ${
                  !filter.categorie ? 'bg-emerald-500/10' : 'hover:bg-slate-700/30'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Toutes categories</div>
                    <div className="text-xs text-slate-500 mt-1">Vue globale du catalogue</div>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{produits.length} produits</span>
                </div>
              </button>

              {categoryRecords.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-500 text-sm">Aucune categorie</div>
              ) : (
                categoryRecords.map(category => (
                  <div key={category.id} className={filter.categorie === category.nom ? 'bg-emerald-500/10' : ''}>
                    <div className="flex items-start justify-between gap-3 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                      <button
                        onClick={() => setFilter(current => ({ ...current, categorie: category.nom }))}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">{category.nom}</div>
                          <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {category.description || 'Aucune description'}
                          </div>
                        </div>
                      </button>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-slate-300 whitespace-nowrap">{category.nb_produits} produits</div>
                        {category.persisted && (
                          <div className="mt-2 flex items-center justify-end gap-3">
                            <button
                              onClick={() => openCategoryEditor(category)}
                              className="text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => deleteCategory(category)}
                              className="text-xs text-red-300 hover:text-red-200 transition-colors"
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showCategoryForm && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {editingCategoryId ? 'Modifier une categorie' : 'Ajouter une categorie'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Exemple: Hygiene, Implant, Sterilisation...
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={categoryForm.nom}
                    onChange={e => setCategoryForm(current => ({ ...current, nom: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={e => setCategoryForm(current => ({ ...current, description: e.target.value }))}
                    rows={4}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                {editingCategoryId && (
                  <button
                    onClick={() => {
                      const category = categoryRecords.find(item => item.id === editingCategoryId)
                      if (category) {
                        deleteCategory(category)
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors mr-auto"
                  >
                    Supprimer
                  </button>
                )}
                <button
                  onClick={resetCategoryForm}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={saveCategory}
                  disabled={savingCategory || !categoryForm.nom.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {savingCategory ? 'Enregistrement...' : editingCategoryId ? 'Mettre a jour' : 'Ajouter la categorie'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 min-w-0">
          {showProductForm && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-white">
                  {editingProductId ? 'Modifier le produit' : 'Ajouter un produit au catalogue'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Le seuil de stock mini sert a remonter les alertes et les besoins de commande dans le dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Reference</label>
                  <input
                    type="text"
                    value={productForm.reference}
                    onChange={e => setProductForm(current => ({ ...current, reference: e.target.value }))}
                    placeholder="REF-001"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-4">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nom du produit *</label>
                  <input
                    type="text"
                    value={productForm.nom}
                    onChange={e => setProductForm(current => ({ ...current, nom: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Categorie</label>
                  <select
                    value={productForm.categorie}
                    onChange={e => setProductForm(current => ({ ...current, categorie: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">- Choisir -</option>
                    {categoryNames.map(categoryName => (
                      <option key={categoryName} value={categoryName}>
                        {categoryName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unite</label>
                  <input
                    type="text"
                    value={productForm.unite}
                    onChange={e => setProductForm(current => ({ ...current, unite: e.target.value }))}
                    placeholder="boite, unite..."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Stock actuel</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.stock_actuel}
                    onChange={e => setProductForm(current => ({ ...current, stock_actuel: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Seuil alerte stock</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.stock_minimum}
                    onChange={e => setProductForm(current => ({ ...current, stock_minimum: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Prix unitaire HT</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.prix_unitaire}
                    onChange={e => setProductForm(current => ({ ...current, prix_unitaire: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="xl:col-span-4">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur principal</label>
                  <select
                    value={productForm.fournisseur_id}
                    onChange={e => setProductForm(current => ({ ...current, fournisseur_id: Number(e.target.value) || '' }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">- Aucun -</option>
                    {fournisseurs.map(fournisseur => (
                      <option key={fournisseur.id} value={fournisseur.id}>
                        {fournisseur.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={resetProductForm}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                >
                  Annuler
                </button>

                <button
                  onClick={saveProduct}
                  disabled={savingProduct || !productForm.nom.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {savingProduct ? 'Enregistrement...' : editingProductId ? 'Mettre a jour le produit' : 'Ajouter au catalogue'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
            <div className="px-5 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Catalogue produits ({filteredProduits.length})
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {filter.categorie ? `Categorie active: ${filter.categorie}` : 'Toutes categories'}
                  {' - '}
                  {filteredProduits.filter(produit => Number(produit.stock_actuel || 0) <= Number(produit.stock_minimum || 0)).length} en alerte
                </p>
              </div>
              <button
                onClick={() => {
                  setProductForm(createEmptyProductForm())
                  setEditingProductId(null)
                  setShowProductForm(true)
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter un produit
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] xl:min-w-[1080px] 2xl:min-w-[1220px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>

                <thead>
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-700 bg-slate-750">
                    <th className="text-left py-3 px-4">Reference</th>
                    <th className="text-left py-3 px-4">Produit</th>
                    <th className="text-left py-3 px-3">Categorie</th>
                    <th className="text-right py-3 px-3">Stock</th>
                    <th className="text-right py-3 px-3">Seuil</th>
                    <th className="text-right py-3 px-3">Prix HT</th>
                    <th className="text-left py-3 px-3">Fournisseur</th>
                    <th className="text-center py-3 px-3">Action</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-700/50">
                  {filteredProduits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-500">
                        Aucun produit trouve avec ces filtres.
                      </td>
                    </tr>
                  ) : (
                    filteredProduits.map(produit => {
                      const status = stockStatus(produit)

                      return (
                        <tr key={produit.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 px-4 text-slate-400 font-mono text-xs truncate" title={produit.reference || '-'}>
                            {produit.reference || '-'}
                          </td>

                          <td className="py-3 px-4 font-medium text-white">
                            <div className="truncate" title={produit.nom}>{produit.nom}</div>
                            <div className={`mt-1 inline-flex text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${status.cls}`}>
                              {status.label}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            {produit.categorie ? (
                              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {produit.categorie}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">Non classe</span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right font-semibold text-white whitespace-nowrap tabular-nums">
                            {Number(produit.stock_actuel || 0)} <span className="text-xs font-normal text-slate-400">{produit.unite}</span>
                          </td>

                          <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap tabular-nums">
                            {Number(produit.stock_minimum || 0)}
                          </td>

                          <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap tabular-nums">
                            {Number(produit.prix_unitaire || 0) > 0 ? formatMoney(produit.prix_unitaire) : '-'}
                          </td>

                          <td className="py-3 px-3 text-slate-400 text-xs truncate" title={produit.fournisseur_nom || '-'}>
                            {produit.fournisseur_nom || '-'}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => openProductEditor(produit)}
                              className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Modifier
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
