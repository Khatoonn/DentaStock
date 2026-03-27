import { useEffect, useMemo, useRef, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
}

function buildProductForm(produit) {
  return {
    reference: produit.reference || '',
    nom: produit.nom || '',
    categorie: produit.categorie || '',
    unite: produit.unite || 'unite',
    stock_actuel: Number(produit.stock_actuel || 0),
    stock_minimum: Number(produit.stock_minimum || 0),
    prix_unitaire: Number(produit.prix_unitaire || 0),
    fournisseur_id: produit.fournisseur_id || null,
  }
}

export default function Stock() {
  const productSheetRef = useRef(null)
  const [produits, setProduits] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [selectedProduitId, setSelectedProduitId] = useState(null)
  const [productForm, setProductForm] = useState(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productHistory, setProductHistory] = useState({ commandes: [], receptions: [] })
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    const [nextProduits, nextCategories] = await Promise.all([
      window.api.produitsList(),
      window.api.categoriesList(),
    ])

    setProduits(nextProduits)
    setCategories(nextCategories)
    setDrafts(
      Object.fromEntries(
        nextProduits.map(produit => [produit.id, String(Number(produit.stock_actuel || 0))])
      )
    )
  }

  useEffect(() => {
    if (isElectron) {
      load()
    }
  }, [])

  useEffect(() => {
    if (!selectedProduitId) return

    const currentProduit = produits.find(produit => produit.id === selectedProduitId)
    if (!currentProduit) {
      setSelectedProduitId(null)
      setProductForm(null)
      return
    }

    setProductForm(buildProductForm(currentProduit))
  }, [produits, selectedProduitId])

  const filteredProduits = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return produits

    return produits.filter(produit => {
      const text = `${produit.nom || ''} ${produit.reference || ''} ${produit.categorie || ''}`.toLowerCase()
      return text.includes(query)
    })
  }, [produits, search])

  const loadProductHistory = async produitId => {
    if (!isElectron) {
      setProductHistory({ commandes: [], receptions: [] })
      return
    }

    setLoadingHistory(true)

    try {
      const nextHistory = await window.api.produitsHistory(produitId)
      setProductHistory(nextHistory || { commandes: [], receptions: [] })
    } catch {
      setProductHistory({ commandes: [], receptions: [] })
    } finally {
      setLoadingHistory(false)
    }
  }

  const openProductSheet = async produit => {
    setSelectedProduitId(produit.id)
    setProductForm(buildProductForm(produit))
    setProductHistory({ commandes: [], receptions: [] })
    setError('')

    window.requestAnimationFrame(() => {
      productSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })

    await loadProductHistory(produit.id)
  }

  const clearSuccessLater = message => {
    setSuccess(message)
    window.clearTimeout(clearSuccessLater.timer)
    clearSuccessLater.timer = window.setTimeout(() => setSuccess(''), 2500)
  }

  const saveStock = async produit => {
    const nextValue = Number(drafts[produit.id])
    if (Number.isNaN(nextValue) || nextValue < 0) {
      setError('Le stock doit etre un nombre positif ou nul.')
      return
    }

    setSavingId(produit.id)
    setError('')

    try {
      await window.api.produitsUpdate(produit.id, {
        reference: produit.reference || '',
        nom: produit.nom,
        categorie: produit.categorie || null,
        unite: produit.unite || 'unite',
        stock_actuel: nextValue,
        stock_minimum: Number(produit.stock_minimum || 0),
        prix_unitaire: Number(produit.prix_unitaire || 0),
        fournisseur_id: produit.fournisseur_id || null,
      })

      await load()
      clearSuccessLater(`Stock mis a jour pour ${produit.nom}.`)
    } catch (nextError) {
      setError(nextError.message || 'Impossible de mettre a jour le stock.')
    } finally {
      setSavingId(null)
    }
  }

  const saveProductSheet = async () => {
    const produit = produits.find(item => item.id === selectedProduitId)
    if (!produit || !productForm?.nom?.trim()) {
      setError('Le nom du produit est obligatoire.')
      return
    }

    setSavingProduct(true)
    setError('')

    try {
      await window.api.produitsUpdate(produit.id, {
        reference: productForm.reference || '',
        nom: productForm.nom.trim(),
        categorie: productForm.categorie || null,
        unite: productForm.unite || 'unite',
        stock_actuel: Number(productForm.stock_actuel || 0),
        stock_minimum: Number(productForm.stock_minimum || 0),
        prix_unitaire: Number(productForm.prix_unitaire || 0),
        fournisseur_id: produit.fournisseur_id || null,
      })

      await load()
      await loadProductHistory(produit.id)
      clearSuccessLater(`Fiche produit mise a jour pour ${productForm.nom.trim()}.`)
    } catch (nextError) {
      setError(nextError.message || 'Impossible de mettre a jour la fiche produit.')
    } finally {
      setSavingProduct(false)
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {success && (
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-3 text-emerald-300 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-red-300 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <input
            type="text"
            placeholder="Rechercher un produit par son nom..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full lg:max-w-xl bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
          />
          <div className="text-sm text-slate-400">
            {filteredProduits.length} produit{filteredProduits.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,360px)] gap-6 min-w-0 items-start">
        <div className="space-y-4 min-w-0">
          <div className="xl:hidden space-y-3">
            {filteredProduits.length === 0 ? (
              <div className="bg-slate-800 rounded-xl border border-slate-700 py-10 text-center text-slate-500 text-sm">
                Aucun produit trouve.
              </div>
            ) : (
              filteredProduits.map(produit => (
                <div key={produit.id} className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        onClick={() => openProductSheet(produit)}
                        className="text-left text-white font-medium hover:text-emerald-300 transition-colors w-full"
                      >
                        <span className="block truncate" title={produit.nom}>{produit.nom}</span>
                      </button>
                      <div className="text-xs text-slate-500 mt-1 break-words">
                        {produit.reference || 'Sans reference'}
                        {produit.categorie ? ` - ${produit.categorie}` : ' - Non classe'}
                      </div>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <div className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">
                        {Number(produit.stock_actuel || 0)} <span className="text-xs font-normal text-slate-400">{produit.unite}</span>
                      </div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">Seuil {Number(produit.stock_minimum || 0)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={drafts[produit.id] ?? ''}
                      onChange={e => setDrafts(current => ({ ...current, [produit.id]: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right"
                    />
                    <button
                      onClick={() => saveStock(produit)}
                      disabled={savingId === produit.id}
                      className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {savingId === produit.id ? 'Maj...' : 'Mettre a jour'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden xl:block bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead className="bg-slate-750">
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                    <th className="text-left py-3 px-4">Reference</th>
                    <th className="text-left py-3 px-4">Produit</th>
                    <th className="text-right py-3 px-3">Stock actuel</th>
                    <th className="text-right py-3 px-3">Seuil</th>
                    <th className="text-right py-3 px-3">Nouveau stock</th>
                    <th className="text-left py-3 px-3">Categorie</th>
                    <th className="text-center py-3 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {filteredProduits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-500">Aucun produit trouve.</td>
                    </tr>
                  ) : (
                    filteredProduits.map(produit => (
                      <tr key={produit.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono text-xs truncate" title={produit.reference || '-'}>
                          {produit.reference || '-'}
                        </td>
                        <td className="py-3 px-4 min-w-0">
                          <button
                            onClick={() => openProductSheet(produit)}
                            className="text-left text-white font-medium hover:text-emerald-300 transition-colors w-full min-w-0"
                          >
                            <span className="block truncate" title={produit.nom}>{produit.nom}</span>
                          </button>
                          <div className="text-xs text-slate-500 mt-1 truncate">Cliquer pour ouvrir la fiche produit</div>
                        </td>
                        <td className="py-3 px-3 text-right text-white whitespace-nowrap tabular-nums">
                          {Number(produit.stock_actuel || 0)} <span className="text-xs text-slate-400">{produit.unite}</span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap tabular-nums">
                          {Number(produit.stock_minimum || 0)}
                        </td>
                        <td className="py-3 px-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={drafts[produit.id] ?? ''}
                            onChange={e => setDrafts(current => ({ ...current, [produit.id]: e.target.value }))}
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right"
                          />
                        </td>
                        <td className="py-3 px-3 text-slate-400 truncate" title={produit.categorie || 'Non classe'}>
                          {produit.categorie || 'Non classe'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => saveStock(produit)}
                            disabled={savingId === produit.id}
                            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
                          >
                            {savingId === produit.id ? 'Maj...' : 'Mettre a jour'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          ref={productSheetRef}
          className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4 min-w-0 2xl:self-start 2xl:max-h-[calc(100vh-10rem)] 2xl:overflow-y-auto"
        >
          {productForm && selectedProduitId ? (
            <>
              <div>
                <h3 className="text-sm font-semibold text-white">Fiche produit</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Modifie le stock, la categorie et les informations principales du produit selectionne.
                </p>
                <div className="text-sm font-medium text-emerald-300 mt-3 break-words">
                  {productForm.nom || 'Produit sans nom'}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Reference</label>
                  <input
                    type="text"
                    value={productForm.reference}
                    onChange={e => setProductForm(current => ({ ...current, reference: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nom du produit</label>
                  <input
                    type="text"
                    value={productForm.nom}
                    onChange={e => setProductForm(current => ({ ...current, nom: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Stock actuel</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stock_actuel}
                      onChange={e => setProductForm(current => ({ ...current, stock_actuel: Number(e.target.value) }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Seuil alerte</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={productForm.stock_minimum}
                      onChange={e => setProductForm(current => ({ ...current, stock_minimum: Number(e.target.value) }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Categorie</label>
                    <select
                      value={productForm.categorie}
                      onChange={e => setProductForm(current => ({ ...current, categorie: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                    >
                      <option value="">Aucune categorie</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.nom}>
                          {category.nom}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Unite</label>
                    <input
                      type="text"
                      value={productForm.unite}
                      onChange={e => setProductForm(current => ({ ...current, unite: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Prix unitaire HT</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.prix_unitaire}
                    onChange={e => setProductForm(current => ({ ...current, prix_unitaire: Number(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white text-right"
                  />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">Historique d achat</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Dernieres commandes et receptions de ce produit, avec fournisseur et prix.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">Commandes</div>
                      <div className="text-xs text-slate-400">{productHistory.commandes.length}</div>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-700/50">
                      {loadingHistory ? (
                        <div className="px-4 py-6 text-sm text-slate-500 text-center">Chargement...</div>
                      ) : productHistory.commandes.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500 text-center">Aucune commande pour ce produit.</div>
                      ) : (
                        productHistory.commandes.map(commande => (
                          <div key={`commande-${commande.commande_id}-${commande.date_commande}`} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-white truncate">
                                  {commande.fournisseur_nom || 'Fournisseur non renseigne'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                  {new Date(commande.date_commande).toLocaleDateString('fr-FR')}
                                  {commande.reference_commande ? ` - ${commande.reference_commande}` : ''}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm text-emerald-300 whitespace-nowrap tabular-nums">
                                  {formatMoney(commande.prix_unitaire)}
                                </div>
                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                  {Number(commande.quantite || 0)} un.
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                              <span className="text-slate-500">{commande.statut}</span>
                              <span className="text-slate-400 whitespace-nowrap tabular-nums">{formatMoney(commande.montant_total)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">Receptions</div>
                      <div className="text-xs text-slate-400">{productHistory.receptions.length}</div>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-700/50">
                      {loadingHistory ? (
                        <div className="px-4 py-6 text-sm text-slate-500 text-center">Chargement...</div>
                      ) : productHistory.receptions.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-slate-500 text-center">Aucune reception pour ce produit.</div>
                      ) : (
                        productHistory.receptions.map(reception => (
                          <div key={`reception-${reception.reception_id}-${reception.date}-${reception.lot || 'sans-lot'}`} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-white truncate">
                                  {reception.fournisseur_nom || 'Fournisseur non renseigne'}
                                </div>
                                <div className="text-xs text-slate-400 mt-1">
                                  {new Date(reception.date).toLocaleDateString('fr-FR')}
                                  {reception.reference_bl ? ` - ${reception.reference_bl}` : ''}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm text-sky-300 whitespace-nowrap tabular-nums">
                                  {formatMoney(reception.prix_unitaire)}
                                </div>
                                <div className="text-xs text-slate-500 whitespace-nowrap">
                                  {Number(reception.quantite || 0)} un.
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                              <span className="text-slate-500">
                                {reception.lot ? `Lot ${reception.lot}` : 'Sans lot'}
                              </span>
                              <span className="text-slate-400 whitespace-nowrap tabular-nums">{formatMoney(reception.montant_total)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={() => setProductForm(current => ({ ...current, categorie: '' }))}
                  className="px-4 py-2 rounded-lg text-sm text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors"
                >
                  Retirer la categorie
                </button>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
                  <button
                    onClick={() => {
                      setSelectedProduitId(null)
                      setProductForm(null)
                    }}
                    className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={saveProductSheet}
                    disabled={savingProduct}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                  >
                    {savingProduct ? 'Enregistrement...' : 'Enregistrer la fiche'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full min-h-[260px] 2xl:min-h-[420px] flex flex-col items-center justify-center text-center text-slate-500">
              <svg className="w-10 h-10 mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <div className="text-sm text-slate-400">Clique sur un produit pour ouvrir sa fiche.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
