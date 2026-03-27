import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_FOURNISSEURS = [
  { id: 1, nom: 'Henry Schein' },
  { id: 2, nom: 'Gacd' },
]

const DEMO_PRODUITS = [
  { id: 1, nom: 'Gants nitrile M', reference: 'GANT-001', unite: 'boite', prix_unitaire: 11.5 },
  { id: 2, nom: 'Carpules d articaine 1/100 000', reference: 'ANES-001', unite: 'boite', prix_unitaire: 29 },
]

const DEMO_COMMANDES = [
  {
    id: 1,
    date_commande: '2026-03-25',
    date_prevue: '2026-03-29',
    fournisseur_id: 1,
    fournisseur_nom: 'Henry Schein',
    reference_commande: 'CMD-2026-001',
    statut: 'EN_ATTENTE',
    notes: 'Commande de test',
    nb_produits: 2,
    montant_total: 81,
    items: [
      { produit_id: 1, quantite: 2, quantite_recue: 0, quantite_restante: 2, prix_unitaire: 11.5 },
      { produit_id: 2, quantite: 2, quantite_recue: 0, quantite_restante: 2, prix_unitaire: 29 },
    ],
  },
]

function createEmptyForm() {
  return {
    date_commande: new Date().toISOString().split('T')[0],
    date_prevue: '',
    fournisseur_id: '',
    reference_commande: '',
    statut: 'EN_ATTENTE',
    notes: '',
    items: [],
  }
}

const STATUS_OPTIONS = [
  { value: 'EN_ATTENTE', label: 'En attente' },
  { value: 'PARTIELLE', label: 'Partielle' },
  { value: 'RECUE', label: 'Recue' },
  { value: 'ANNULEE', label: 'Annulee' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(option => [option.value, option.label]))

const STATUS_COLORS = {
  EN_ATTENTE: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  PARTIELLE: 'bg-sky-500/15 text-sky-300 border border-sky-500/20',
  RECUE: 'bg-green-500/15 text-green-300 border border-green-500/20',
  ANNULEE: 'bg-slate-700 text-slate-300 border border-slate-600',
}

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatMoney(value) {
  return `${moneyFormatter.format(Number(value || 0))} \u20ac`
}

function KpiCard({ label, value, tone }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-3 whitespace-nowrap tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  )
}

function buildFormFromCommande(commande) {
  return {
    date_commande: commande.date_commande || new Date().toISOString().split('T')[0],
    date_prevue: commande.date_prevue || '',
    fournisseur_id: Number(commande.fournisseur_id || '') || '',
    reference_commande: commande.reference_commande || '',
    statut: commande.statut || 'EN_ATTENTE',
    notes: commande.notes || '',
    items: (commande.items || []).map(item => ({
      produit_id: Number(item.produit_id || ''),
      quantite: Number(item.quantite || 0),
      prix_unitaire: Number(item.prix_unitaire || 0),
    })),
  }
}

function getDemoCommande(id) {
  return DEMO_COMMANDES.find(commande => commande.id === id) || null
}

function CommandeLineItem({ item, produits, onChange, onRemove }) {
  const produit = produits.find(p => p.id === item.produit_id) || {}
  const total = (item.quantite || 0) * (item.prix_unitaire || 0)

  return (
    <tr className="border-b border-slate-700">
      <td className="py-2 pr-2">
        <select
          value={item.produit_id}
          onChange={e => {
            const nextProduit = produits.find(p => p.id === Number(e.target.value))
            onChange({
              ...item,
              produit_id: Number(e.target.value),
              prix_unitaire: nextProduit ? nextProduit.prix_unitaire : 0,
            })
          }}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white"
        >
          <option value="">- Choisir un produit -</option>
          {produits.map(produitOption => (
            <option key={produitOption.id} value={produitOption.id}>
              {produitOption.nom} ({produitOption.reference})
            </option>
          ))}
        </select>
      </td>

      <td className="py-2 px-2 text-xs text-slate-400 whitespace-nowrap">{produit.unite || '-'}</td>

      <td className="py-2 px-2">
        <input
          type="number"
          min="0"
          step="1"
          value={item.quantite}
          onChange={e => onChange({ ...item, quantite: Number(e.target.value) })}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white text-right"
        />
      </td>

      <td className="py-2 px-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.prix_unitaire}
          onChange={e => onChange({ ...item, prix_unitaire: Number(e.target.value) })}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white text-right"
        />
      </td>

      <td className="py-2 pl-2 text-right text-sm font-medium text-slate-300 whitespace-nowrap tabular-nums">
        {formatMoney(total)}
      </td>

      <td className="py-2 pl-2 text-right">
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

export default function Commandes() {
  const navigate = useNavigate()
  const [fournisseurs, setFournisseurs] = useState([])
  const [produits, setProduits] = useState([])
  const [commandes, setCommandes] = useState([])
  const [form, setForm] = useState(createEmptyForm)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editingCommandeId, setEditingCommandeId] = useState(null)
  const [editingInfo, setEditingInfo] = useState(null)

  const load = async () => {
    if (isElectron) {
      const [nextFournisseurs, nextProduits, nextCommandes] = await Promise.all([
        window.api.fournisseursList(),
        window.api.produitsList(),
        window.api.commandesList(),
      ])

      setFournisseurs(nextFournisseurs)
      setProduits(nextProduits)
      setCommandes(nextCommandes)
      return
    }

    setFournisseurs(DEMO_FOURNISSEURS)
    setProduits(DEMO_PRODUITS)
    setCommandes(DEMO_COMMANDES)
  }

  useEffect(() => {
    load()
  }, [])

  const resetForm = () => {
    setForm(createEmptyForm())
    setShowForm(false)
    setEditingCommandeId(null)
    setEditingInfo(null)
    setError('')
  }

  const addItem = () => {
    setForm(current => ({
      ...current,
      items: [...current.items, { produit_id: '', quantite: 1, prix_unitaire: 0 }],
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
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const openNewForm = () => {
    setForm(createEmptyForm())
    setEditingCommandeId(null)
    setEditingInfo(null)
    setError('')
    setShowForm(current => (editingCommandeId ? true : !current))
  }

  const openEditForm = async commandeId => {
    setError('')

    try {
      const commande = isElectron ? await window.api.commandesGet(commandeId) : getDemoCommande(commandeId)
      if (!commande) {
        throw new Error('Commande introuvable.')
      }

      setForm(buildFormFromCommande(commande))
      setEditingCommandeId(commande.id)
      setEditingInfo({
        reference_commande: commande.reference_commande,
        fournisseur_nom: commande.fournisseur_nom,
        lignes_recues: (commande.items || []).filter(item => Number(item.quantite_recue || 0) > 0).length,
      })
      setShowForm(true)
    } catch (nextError) {
      setError(nextError.message || 'Impossible d ouvrir la commande.')
    }
  }

  const save = async () => {
    if (!form.date_commande || !form.fournisseur_id || form.items.length === 0) return
    if (form.items.some(item => !item.produit_id || Number(item.quantite) <= 0)) return

    setSaving(true)
    setError('')

    try {
      if (isElectron) {
        if (editingCommandeId) {
          await window.api.commandesUpdate(editingCommandeId, form)
        } else {
          await window.api.commandesAdd(form)
        }
      }

      setSuccess(editingCommandeId ? 'Commande mise a jour.' : 'Commande enregistree. Le stock ne bougera qu au moment de la reception.')
      resetForm()
      await load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (nextError) {
      setError(nextError.message || 'Impossible d enregistrer la commande.')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (commandeId, statut) => {
    if (isElectron) {
      await window.api.commandesUpdateStatus(commandeId, statut)
      load()
      return
    }

    setCommandes(current =>
      current.map(commande => (commande.id === commandeId ? { ...commande, statut } : commande))
    )
  }

  const openReception = commandeId => {
    navigate(`/reception?commande=${commandeId}`)
  }

  const formTotal = form.items.reduce((sum, item) => {
    return sum + (item.quantite || 0) * (item.prix_unitaire || 0)
  }, 0)

  const filteredCommandes = useMemo(() => {
    return commandes.filter(commande => !filterStatus || commande.statut === filterStatus)
  }, [commandes, filterStatus])

  const totalCommandes = commandes.length
  const commandesEnAttente = commandes.filter(commande => ['EN_ATTENTE', 'PARTIELLE'].includes(commande.statut)).length
  const commandesRecues = commandes.filter(commande => commande.statut === 'RECUE').length
  const montantEnAttente = commandes
    .filter(commande => ['EN_ATTENTE', 'PARTIELLE'].includes(commande.statut))
    .reduce((sum, commande) => sum + Number(commande.montant_total || 0), 0)

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

      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4 text-sm text-emerald-100">
        Cette page sert a suivre les commandes passees et en attente de reception. Une commande peut maintenant etre reouverte pour correction apres validation.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Commandes" value={totalCommandes} tone="text-white" />
        <KpiCard label="En attente" value={commandesEnAttente} tone="text-amber-300" />
        <KpiCard label="Recues" value={commandesRecues} tone="text-green-300" />
        <KpiCard label="Montant en attente" value={formatMoney(montantEnAttente)} tone="text-sky-300" />
      </div>

      <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Tous les statuts</option>
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openNewForm}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {editingCommandeId ? 'Nouvelle commande' : 'Nouvelle commande'}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white">
                {editingCommandeId ? 'Modifier une commande fournisseur' : 'Enregistrer une commande fournisseur'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tu peux corriger une commande meme apres validation.
              </p>
            </div>

            {editingCommandeId && editingInfo && (
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3 text-sm text-sky-100 max-w-xl">
                <div className="font-medium">
                  Edition de {editingInfo.reference_commande || `commande #${editingCommandeId}`}
                </div>
                <div className="text-xs text-sky-200/80 mt-1">
                  {editingInfo.fournisseur_nom || 'Fournisseur non renseigne'}
                  {editingInfo.lignes_recues > 0 ? ` - ${editingInfo.lignes_recues} ligne${editingInfo.lignes_recues > 1 ? 's' : ''} deja recues` : ' - aucune reception encore liee'}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Date commande *</label>
              <input
                type="date"
                value={form.date_commande}
                onChange={e => setForm(current => ({ ...current, date_commande: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Reception prevue</label>
              <input
                type="date"
                value={form.date_prevue}
                onChange={e => setForm(current => ({ ...current, date_prevue: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur *</label>
              <select
                value={form.fournisseur_id}
                onChange={e => setForm(current => ({ ...current, fournisseur_id: Number(e.target.value) || '' }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">- Selectionner -</option>
                {fournisseurs.map(fournisseur => (
                  <option key={fournisseur.id} value={fournisseur.id}>
                    {fournisseur.nom}
                  </option>
                ))}
              </select>
            </div>

            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Ref. commande</label>
              <input
                type="text"
                value={form.reference_commande}
                onChange={e => setForm(current => ({ ...current, reference_commande: e.target.value }))}
                placeholder="CMD-2026-001"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Statut</label>
              <select
                value={form.statut}
                onChange={e => setForm(current => ({ ...current, statut: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 xl:col-span-12">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(current => ({ ...current, notes: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Produits commandes</span>
              <button
                onClick={addItem}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Ajouter une ligne
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '46%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '4%' }} />
                </colgroup>
                <thead className="bg-slate-750">
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-3">Produit</th>
                    <th className="text-left py-2 px-2">Unite</th>
                    <th className="text-right py-2 px-2">Qte</th>
                    <th className="text-right py-2 px-2">Prix unit. HT</th>
                    <th className="text-right py-2 px-2">Total HT</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="bg-slate-800">
                  {form.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-500 text-xs">
                        Ajoute les produits commandes pour suivre ce qui doit arriver.
                      </td>
                    </tr>
                  ) : (
                    form.items.map((item, index) => (
                      <CommandeLineItem
                        key={index}
                        item={item}
                        produits={produits}
                        onChange={value => updateItem(index, value)}
                        onRemove={() => removeItem(index)}
                      />
                    ))
                  )}
                </tbody>
                {form.items.length > 0 && (
                  <tfoot className="bg-slate-750 border-t border-slate-700">
                    <tr>
                      <td colSpan={4} className="py-2 px-3 text-right text-sm font-semibold text-slate-300">
                        Total commande :
                      </td>
                      <td className="py-2 px-2 text-right text-sm font-bold text-white whitespace-nowrap tabular-nums">
                        {formatMoney(formTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>

            <button
              onClick={save}
              disabled={saving || !form.fournisseur_id || form.items.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Enregistrement...' : editingCommandeId ? 'Mettre a jour la commande' : 'Valider la commande'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
        <div className="px-5 py-4 border-b border-slate-700">
          <h3 className="text-sm font-semibold text-white">
            Suivi des commandes ({filteredCommandes.length})
          </h3>
        </div>

        <div className="divide-y divide-slate-700/50">
          {filteredCommandes.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">Aucune commande trouvee</div>
          ) : (
            filteredCommandes.map(commande => (
              <div
                key={commande.id}
                className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_180px_170px_170px_180px] gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[commande.statut] || STATUS_COLORS.EN_ATTENTE}`}>
                      {STATUS_LABELS[commande.statut] || commande.statut}
                    </span>
                    {commande.reference_commande && (
                      <span className="text-sm font-medium text-white truncate" title={commande.reference_commande}>
                        {commande.reference_commande}
                      </span>
                    )}
                  </div>

                  <div className="text-sm font-medium text-white mt-2 truncate" title={commande.fournisseur_nom}>
                    {commande.fournisseur_nom || 'Fournisseur non renseigne'}
                  </div>

                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span>Commandee le {new Date(commande.date_commande).toLocaleDateString('fr-FR')}</span>
                    {commande.date_prevue && (
                      <span>Prevue le {new Date(commande.date_prevue).toLocaleDateString('fr-FR')}</span>
                    )}
                    <span>{commande.nb_produits || 0} produit{commande.nb_produits > 1 ? 's' : ''}</span>
                  </div>

                  {commande.notes && (
                    <div className="text-xs text-slate-500 mt-2 truncate" title={commande.notes}>
                      {commande.notes}
                    </div>
                  )}
                </div>

                <div className="flex items-center 2xl:justify-end">
                  <div className="text-left 2xl:text-right">
                    <div className="text-xs text-slate-500">Montant estime</div>
                    <div className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">
                      {formatMoney(commande.montant_total)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center">
                  <button
                    onClick={() => openEditForm(commande.id)}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Modifier
                  </button>
                </div>

                <div className="flex items-center">
                  {['EN_ATTENTE', 'PARTIELLE'].includes(commande.statut) ? (
                    <button
                      onClick={() => openReception(commande.id)}
                      className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Receptionner
                    </button>
                  ) : (
                    <div className="w-full text-xs text-slate-500 text-center">
                      Aucun mouvement
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <select
                    value={commande.statut}
                    onChange={e => updateStatus(commande.id, e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
