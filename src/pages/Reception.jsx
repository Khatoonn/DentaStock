import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'
import ProductSearchInput from '../components/ProductSearchInput'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const STAGE_OPTIONS = [
  { value: 'A_FAIRE', label: 'Commande a faire' },
  { value: 'EN_ATTENTE', label: 'En attente de reception' },
  { value: 'RECEPTIONNEES', label: 'Receptionnees' },
  { value: 'ARCHIVEES', label: 'Archivees' },
  { value: 'RETOURS', label: 'Retours' },
]

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

function getFileKind(filePath) {
  const lower = String(filePath || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(lower)) return 'image'
  return 'other'
}

function createEmptyCommandeForm() {
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

function createEmptyReceptionForm() {
  return {
    date: new Date().toISOString().split('T')[0],
    fournisseur_id: '',
    commande_id: null,
    append_to_reception_id: null,
    reference_bl: '',
    reference_facture: '',
    notes: '',
    document_path: '',
    items: [],
  }
}

function buildCommandeFormFromCommande(commande) {
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
      quantite_recue: Number(item.quantite_recue || 0),
    })),
  }
}

function buildReceptionFormFromCommande(commande) {
  return {
    ...createEmptyReceptionForm(),
    fournisseur_id: Number(commande.fournisseur_id || '') || '',
    commande_id: commande.id,
    append_to_reception_id: Number(commande.active_reception_id || 0) || null,
    notes: commande.active_reception_id ? '' : (commande.notes || ''),
    items: (commande.items || [])
      .filter(item => Number(item.quantite_restante ?? item.quantite ?? 0) > 0)
      .map(item => ({
        produit_id: Number(item.produit_id),
        quantite: Number(item.quantite_restante ?? item.quantite ?? 0),
        quantite_commandee: Number(item.quantite || 0),
        prix_unitaire: Number(item.prix_unitaire || 0),
        lot: '',
        date_expiration: '',
      })),
  }
}

function buildReceptionFormFromReception(reception) {
  return {
    date: reception.date || new Date().toISOString().split('T')[0],
    fournisseur_id: Number(reception.fournisseur_id || '') || '',
    commande_id: Number(reception.commande_id || 0) || null,
    append_to_reception_id: null,
    reference_bl: reception.reference_bl || '',
    reference_facture: reception.reference_facture || '',
    notes: reception.notes || '',
    document_path: reception.document_path || '',
    items: (reception.items || []).map(item => ({
      produit_id: Number(item.produit_id || ''),
      quantite: Number(item.quantite || 0),
      prix_unitaire: Number(item.prix_unitaire || 0),
      lot: item.lot || '',
      date_expiration: item.date_expiration || '',
    })),
  }
}

function CommandeLineItem({ item, produits, remises, onChange, onRemove, showReceivedCol }) {
  const produit = produits.find(p => p.id === item.produit_id) || {}
  // Calculate applicable discount
  const remise = remises
    ?.filter(r => (item.quantite || 0) >= r.seuil_quantite)
    .sort((a, b) => b.seuil_quantite - a.seuil_quantite)[0]
  const remisePct = remise ? remise.remise_pourcent : 0
  const prixApresRemise = (item.prix_unitaire || 0) * (1 - remisePct / 100)
  const total = (item.quantite || 0) * prixApresRemise
  const qteRecue = Number(item.quantite_recue || 0)
  const qteCommandee = Number(item.quantite || 0)

  return (
    <tr className="border-b border-slate-700">
      <td className="py-2 pr-2">
        <ProductSearchInput
          produits={produits}
          value={item.produit_id}
          onChange={p => {
            onChange({
              ...item,
              produit_id: p ? p.id : '',
              prix_unitaire: p ? p.prix_unitaire : 0,
            })
          }}
          placeholder="Nom, reference ou code-barre..."
        />
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
      {showReceivedCol && (
        <td className="py-2 px-2 text-center text-sm tabular-nums whitespace-nowrap">
          <span className={qteRecue >= qteCommandee ? 'text-emerald-400' : qteRecue > 0 ? 'text-amber-400' : 'text-slate-500'}>
            {qteRecue}
          </span>
          <span className="text-slate-600 mx-1">/</span>
          <span className="text-slate-400">{qteCommandee}</span>
        </td>
      )}
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
      <td className="py-2 pl-2 text-right text-sm whitespace-nowrap tabular-nums">
        <div className="font-medium text-slate-300">{formatMoney(total)}</div>
        {remisePct > 0 && (
          <div className="text-xs text-emerald-400">-{remisePct}%</div>
        )}
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

function ReceptionLineItem({ item, produits, onChange, onRemove }) {
  const produit = produits.find(p => p.id === item.produit_id) || {}
  const total = (item.quantite || 0) * (item.prix_unitaire || 0)
  const hasCommandeQty = item.quantite_commandee > 0
  const isFullyReceived = hasCommandeQty && Number(item.quantite || 0) >= item.quantite_commandee

  return (
    <tr className="border-b border-slate-700">
      <td className="py-2 pr-2">
        <ProductSearchInput
          produits={produits}
          value={item.produit_id}
          onChange={p => {
            onChange({
              ...item,
              produit_id: p ? p.id : '',
              prix_unitaire: p ? p.prix_unitaire : 0,
            })
          }}
          placeholder="Nom, reference ou code-barre..."
        />
      </td>
      <td className="py-2 px-2 text-xs text-slate-400 whitespace-nowrap">{produit.unite || '-'}</td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="1"
            value={item.quantite}
            onChange={e => onChange({ ...item, quantite: Number(e.target.value) })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white text-right"
          />
          {hasCommandeQty && (
            <button
              type="button"
              title={isFullyReceived ? 'Quantite complete' : `Tout receptionner (${item.quantite_commandee})`}
              onClick={() => !isFullyReceived && onChange({ ...item, quantite: item.quantite_commandee })}
              className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isFullyReceived ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600 hover:bg-emerald-600/30 text-slate-400 hover:text-emerald-300'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </button>
          )}
        </div>
        {hasCommandeQty && (
          <div className="text-[10px] text-slate-500 text-right mt-0.5">/ {item.quantite_commandee} commande{item.quantite_commandee > 1 ? 's' : ''}</div>
        )}
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
      <td className="py-2 px-2">
        <input
          type="text"
          value={item.lot}
          onChange={e => onChange({ ...item, lot: e.target.value })}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white"
          placeholder="No lot"
        />
      </td>
      <td className="py-2 px-2">
        <input
          type="date"
          value={item.date_expiration}
          onChange={e => onChange({ ...item, date_expiration: e.target.value })}
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white"
        />
      </td>
      <td className="py-2 pl-2 text-right text-sm font-medium text-slate-300 whitespace-nowrap tabular-nums">
        {formatMoney(total)}
      </td>
      <td className="py-2 pl-2">
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  )
}

export default function Reception() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preloadedCommandeId = Number(searchParams.get('commande') || 0)

  const { toast, confirm } = useToast()
  const [stage, setStage] = useState('EN_ATTENTE')
  const [commandePlanningView, setCommandePlanningView] = useState('ALERTES')
  const [fournisseurs, setFournisseurs] = useState([])
  const [produits, setProduits] = useState([])
  const [commandes, setCommandes] = useState([])
  const [receptions, setReceptions] = useState([])

  const [commandeForm, setCommandeForm] = useState(createEmptyCommandeForm)
  const [receptionForm, setReceptionForm] = useState(createEmptyReceptionForm)
  const [showCommandeForm, setShowCommandeForm] = useState(false)
  const [showReceptionForm, setShowReceptionForm] = useState(false)
  const [editingCommandeId, setEditingCommandeId] = useState(null)
  const [editingReceptionId, setEditingReceptionId] = useState(null)
  const [commandeInfo, setCommandeInfo] = useState(null)
  const [receptionInfo, setReceptionInfo] = useState(null)
  const [savingCommande, setSavingCommande] = useState(false)
  const [savingReception, setSavingReception] = useState(false)
  const [previewReception, setPreviewReception] = useState(null)
  const [previewDataUrl, setPreviewDataUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState('')
  const [commandeRemises, setCommandeRemises] = useState([])
  const [retours, setRetours] = useState([])
  const [showRetourForm, setShowRetourForm] = useState(false)
  const [retourForm, setRetourForm] = useState({ date: new Date().toISOString().split('T')[0], fournisseur_id: '', motif: '', notes: '', items: [] })
  const [savingRetour, setSavingRetour] = useState(false)
  const [partialAlert, setPartialAlert] = useState(null)

  const load = async () => {
    const [nextFournisseurs, nextProduits, nextCommandes, nextReceptions] = await Promise.all([
      window.api.fournisseursList(),
      window.api.produitsList(),
      window.api.commandesList(),
      window.api.receptionsList(),
    ])

    setFournisseurs(nextFournisseurs)
    setProduits(nextProduits)
    setCommandes(nextCommandes)
    setReceptions(nextReceptions)
  }

  useEffect(() => {
    if (isElectron) {
      load()
    }
  }, [])

  const loadRetours = async () => {
    if (!isElectron) return
    try {
      const r = await window.api.retoursList()
      setRetours(r || [])
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    if (stage === 'RETOURS') loadRetours()
  }, [stage])

  // Load remises when fournisseur changes in commande form
  useEffect(() => {
    if (isElectron && commandeForm.fournisseur_id) {
      window.api.remisesList(commandeForm.fournisseur_id).then(r => setCommandeRemises(r || []))
    } else {
      setCommandeRemises([])
    }
  }, [commandeForm.fournisseur_id])

  useEffect(() => {
    if (isElectron && preloadedCommandeId) {
      openReceptionFromCommande(preloadedCommandeId)
    }
  }, [preloadedCommandeId])

  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      if (!previewReception?.document_path || !isElectron) {
        setPreviewDataUrl('')
        setPreviewLoading(false)
        return
      }

      setPreviewLoading(true)

      try {
        const fileData = await window.api.documentsRead(previewReception.document_path)
        if (!cancelled && fileData?.base64 && fileData?.mimeType) {
          setPreviewDataUrl(`data:${fileData.mimeType};base64,${fileData.base64}`)
        }
      } catch {
        if (!cancelled) {
          setPreviewDataUrl('')
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [previewReception])


  const clearRoutingCommande = () => {
    if (preloadedCommandeId) {
      navigate('/reception', { replace: true })
    }
  }

  const closeCommandeForm = () => {
    setCommandeForm(createEmptyCommandeForm())
    setShowCommandeForm(false)
    setEditingCommandeId(null)
    setCommandeInfo(null)
    setError('')
  }

  const closeReceptionForm = () => {
    setReceptionForm(createEmptyReceptionForm())
    setShowReceptionForm(false)
    setEditingReceptionId(null)
    setReceptionInfo(null)
    setError('')
    clearRoutingCommande()
  }

  const openNewCommande = product => {
    setShowReceptionForm(false)
    setEditingReceptionId(null)
    setReceptionInfo(null)
    setError('')
    clearRoutingCommande()

    setCommandeForm({
      ...createEmptyCommandeForm(),
      fournisseur_id: Number(product?.fournisseur_id || '') || '',
      items: product
        ? [{
            produit_id: product.id,
            quantite: Math.max(
              1,
              Number(product.quantite_conseillee || 0) ||
                (Number(product.stock_minimum || 0) - Number(product.stock_actuel || 0))
            ),
            prix_unitaire: Number(product.prix_unitaire || 0),
          }]
        : [],
    })

    setEditingCommandeId(null)
    setCommandeInfo(null)
    setShowCommandeForm(true)
  }

  const addRetourItem = () => setRetourForm(f => ({ ...f, items: [...f.items, { produit_id: '', quantite: 1, prix_unitaire: 0 }] }))
  const updateRetourItem = (idx, val) => setRetourForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? val : it) }))
  const removeRetourItem = idx => setRetourForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const saveRetour = async () => {
    if (!retourForm.fournisseur_id || retourForm.items.length === 0) return
    setSavingRetour(true)
    try {
      await window.api.retoursAdd(retourForm)
      toast('Retour enregistre. Le stock a ete ajuste.', 'success')
      setShowRetourForm(false)
      setRetourForm({ date: new Date().toISOString().split('T')[0], fournisseur_id: '', motif: '', notes: '', items: [] })
      loadRetours()
      load()
    } catch (e) { toast(e.message, 'error') }
    finally { setSavingRetour(false) }
  }

  const openEditCommande = async commandeId => {
    try {
      const commande = await window.api.commandesGet(commandeId)
      if (!commande) {
        throw new Error('Commande introuvable.')
      }

      setCommandeForm(buildCommandeFormFromCommande(commande))
      setEditingCommandeId(commande.id)
      setCommandeInfo({
        fournisseur_nom: commande.fournisseur_nom,
        reference_commande: commande.reference_commande,
        lignes_recues: (commande.items || []).filter(item => Number(item.quantite_recue || 0) > 0).length,
      })
      setShowCommandeForm(true)
      setShowReceptionForm(false)
      setEditingReceptionId(null)
      setReceptionInfo(null)
      setError('')
      clearRoutingCommande()
    } catch (nextError) {
      setError(nextError.message || 'Impossible d ouvrir la commande.')
    }
  }

  const openManualReception = () => {
    setShowCommandeForm(false)
    setEditingCommandeId(null)
    setCommandeInfo(null)
    setReceptionForm(createEmptyReceptionForm())
    setEditingReceptionId(null)
    setReceptionInfo(null)
    setError('')
    setShowReceptionForm(true)
    clearRoutingCommande()
  }

  async function openReceptionFromCommande(commandeId) {
    try {
      const commande = await window.api.commandesGet(commandeId)
      if (!commande) {
        throw new Error('Commande introuvable.')
      }

      const nextForm = buildReceptionFormFromCommande(commande)
      if (!nextForm.items.length) {
        throw new Error('Cette commande a deja ete entierement receptionnee.')
      }

      setReceptionForm(nextForm)
      setEditingReceptionId(null)
      setReceptionInfo({
        type: commande.active_reception_id ? 'partielle' : 'commande',
        fournisseur_nom: commande.fournisseur_nom,
        reference: commande.reference_commande,
        date_prevue: commande.date_prevue,
        lignes_restantes: nextForm.items.length,
        nb_passages: Number(commande.nb_passages || 0),
        derniere_reception_date: commande.derniere_reception_date,
        active_reception_id: Number(commande.active_reception_id || 0) || null,
      })
      setShowReceptionForm(true)
      setShowCommandeForm(false)
      setEditingCommandeId(null)
      setCommandeInfo(null)
      setError('')
      setStage('EN_ATTENTE')
    } catch (nextError) {
      setError(nextError.message || 'Impossible de preparer la reception.')
    }
  }

  const openEditReception = async receptionId => {
    try {
      const reception = await window.api.receptionsGet(receptionId)
      if (!reception) {
        throw new Error('Reception introuvable.')
      }

      setReceptionForm(buildReceptionFormFromReception(reception))
      setEditingReceptionId(reception.id)
      setReceptionInfo({
        type: 'edition',
        fournisseur_nom: reception.fournisseur_nom,
        reference: reception.reference_bl,
        date: reception.date,
        nb_passages: Number(reception.nb_passages || 0),
        passages: reception.passages || [],
      })
      setShowReceptionForm(true)
      setShowCommandeForm(false)
      setEditingCommandeId(null)
      setCommandeInfo(null)
      setError('')
      setStage('RECEPTIONNEES')
      clearRoutingCommande()
    } catch (nextError) {
      setError(nextError.message || 'Impossible d ouvrir la reception.')
    }
  }

  const addCommandeItem = () => {
    setCommandeForm(current => ({
      ...current,
      items: [...current.items, { produit_id: '', quantite: 1, prix_unitaire: 0 }],
    }))
  }

  const updateCommandeItem = (index, value) => {
    setCommandeForm(current => {
      const items = [...current.items]
      items[index] = value
      return { ...current, items }
    })
  }

  const removeCommandeItem = index => {
    setCommandeForm(current => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const saveCommande = async () => {
    if (!commandeForm.date_commande || !commandeForm.fournisseur_id || commandeForm.items.length === 0) return
    if (commandeForm.items.some(item => !item.produit_id || Number(item.quantite) <= 0)) return

    setSavingCommande(true)
    setError('')

    try {
      if (editingCommandeId) {
        await window.api.commandesUpdate(editingCommandeId, commandeForm)
      } else {
        await window.api.commandesAdd(commandeForm)
      }

      closeCommandeForm()
      await load()
      toast(editingCommandeId ? 'Commande mise a jour.' : 'Commande enregistree.', 'success')
      setStage('EN_ATTENTE')
    } catch (nextError) {
      setError(nextError.message || 'Impossible d enregistrer la commande.')
    } finally {
      setSavingCommande(false)
    }
  }

  const addReceptionItem = () => {
    setReceptionForm(current => ({
      ...current,
      items: [
        ...current.items,
        { produit_id: '', quantite: 1, prix_unitaire: 0, lot: '', date_expiration: '' },
      ],
    }))
  }

  const updateReceptionItem = (index, value) => {
    setReceptionForm(current => {
      const items = [...current.items]
      items[index] = value
      return { ...current, items }
    })
  }

  const removeReceptionItem = index => {
    setReceptionForm(current => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const pickReceptionFile = async () => {
    const selectedPath = await window.api.dialogOpenFile([
      { name: 'PDF / Images', extensions: ['pdf', 'jpg', 'png'] },
    ])

    if (selectedPath) {
      setReceptionForm(current => ({ ...current, document_path: selectedPath }))
    }
  }

  const doSaveReception = async (adjustCommande = false) => {
    setSavingReception(true)
    setError('')
    setPartialAlert(null)

    try {
      if (adjustCommande && receptionForm.commande_id && !editingReceptionId) {
        const commande = await window.api.commandesGet(receptionForm.commande_id)
        if (commande) {
          const updatedItems = (commande.items || []).map(ci => {
            const receptionItem = receptionForm.items.find(ri => ri.produit_id === ci.produit_id)
            const alreadyReceived = Number(ci.quantite_recue || 0)
            const nowReceiving = receptionItem ? Number(receptionItem.quantite || 0) : 0
            return { ...ci, quantite: alreadyReceived + nowReceiving }
          }).filter(ci => Number(ci.quantite || 0) > 0)

          await window.api.commandesUpdate(commande.id, {
            ...commande,
            items: updatedItems,
          })
        }
      }

      if (editingReceptionId) {
        await window.api.receptionsUpdate(editingReceptionId, receptionForm)
      } else {
        await window.api.receptionsAdd(receptionForm)
      }

      closeReceptionForm()
      await load()
      toast(
        editingReceptionId
          ? 'Reception mise a jour.'
          : adjustCommande
            ? 'Reception enregistree — commande ajustee aux quantites recues.'
            : receptionForm.append_to_reception_id
              ? 'Reception partielle ajoutee a la reception existante.'
              : 'Reception enregistree et stock mis a jour.',
        'success'
      )
      setStage('RECEPTIONNEES')
    } catch (nextError) {
      setError(nextError.message || 'Impossible d enregistrer la reception.')
    } finally {
      setSavingReception(false)
    }
  }

  const saveReception = async () => {
    if (!receptionForm.date || !receptionForm.fournisseur_id || receptionForm.items.length === 0) return
    if (receptionForm.items.some(item => !item.produit_id || Number(item.quantite) <= 0)) return

    if (receptionForm.commande_id && !editingReceptionId) {
      try {
        const commande = await window.api.commandesGet(receptionForm.commande_id)
        if (commande) {
          const incomplete = []
          for (const ci of commande.items || []) {
            const alreadyReceived = Number(ci.quantite_recue || 0)
            const ordered = Number(ci.quantite || 0)
            const remaining = ordered - alreadyReceived
            const ri = receptionForm.items.find(r => r.produit_id === ci.produit_id)
            const receiving = ri ? Number(ri.quantite || 0) : 0
            if (receiving < remaining) {
              const produit = produits.find(p => p.id === ci.produit_id)
              incomplete.push({
                nom: produit?.nom || `Produit #${ci.produit_id}`,
                commandee: remaining,
                recue: receiving,
              })
            }
          }

          if (incomplete.length > 0) {
            setPartialAlert({ incomplete })
            return
          }
        }
      } catch (e) {
        console.error('Erreur verification quantites:', e)
      }
    }

    doSaveReception()
  }

  const updateCommandeStatus = async (commandeId, statut) => {
    await window.api.commandesUpdateStatus(commandeId, statut)
    load()
  }

  const deleteCommande = async (commandeId) => {
    if (!(await confirm('Supprimer definitivement cette commande ? Cette action est irreversible.'))) return
    try {
      await window.api.commandesDelete(commandeId)
      toast('Commande supprimee.', 'success')
      load()
    } catch (e) {
      toast(e.message || 'Impossible de supprimer la commande.', 'error')
    }
  }

  const formCommandeTotal = commandeForm.items.reduce((sum, item) => {
    const qty = Number(item.quantite || 0)
    const prix = Number(item.prix_unitaire || 0)
    const remise = commandeRemises
      .filter(r => qty >= r.seuil_quantite)
      .sort((a, b) => b.seuil_quantite - a.seuil_quantite)[0]
    const pct = remise ? remise.remise_pourcent : 0
    return sum + qty * prix * (1 - pct / 100)
  }, 0)

  const formReceptionTotal = receptionForm.items.reduce((sum, item) => {
    return sum + Number(item.quantite || 0) * Number(item.prix_unitaire || 0)
  }, 0)

  const produitsACommander = useMemo(() => {
    return produits
      .filter(produit => Number(produit.stock_actuel || 0) <= Number(produit.stock_minimum || 0))
      .map(produit => {
        const stockActuel = Number(produit.stock_actuel || 0)
        const stockMinimum = Number(produit.stock_minimum || 0)
        const quantiteMinimum = Math.max(1, Math.ceil(stockMinimum - stockActuel))
        const stockCible = Math.max(stockMinimum * 2, stockMinimum + 1)
        const quantiteConseillee = Math.max(quantiteMinimum, Math.ceil(stockCible - stockActuel))

        return {
          ...produit,
          quantite_minimum: quantiteMinimum,
          quantite_conseillee: quantiteConseillee,
          montant_estime: quantiteConseillee * Number(produit.prix_unitaire || 0),
        }
      })
      .sort((left, right) => {
        const leftGap = Number(left.stock_actuel || 0) - Number(left.stock_minimum || 0)
        const rightGap = Number(right.stock_actuel || 0) - Number(right.stock_minimum || 0)
        return leftGap - rightGap
      })
  }, [produits])

  const commandesEnAttente = useMemo(() => {
    return commandes.filter(commande => ['EN_ATTENTE', 'PARTIELLE'].includes(commande.statut))
  }, [commandes])

  const budgetConseille = useMemo(() => {
    return produitsACommander.reduce((sum, produit) => sum + Number(produit.montant_estime || 0), 0)
  }, [produitsACommander])

  const archiveCutoffDate = useMemo(() => {
    const nextDate = new Date()
    nextDate.setMonth(nextDate.getMonth() - 1)
    nextDate.setHours(0, 0, 0, 0)
    return nextDate
  }, [])

  const archiveCutoffLabel = useMemo(() => {
    return archiveCutoffDate.toLocaleDateString('fr-FR')
  }, [archiveCutoffDate])

  const receptionsRecentes = useMemo(() => {
    return receptions.filter(reception => {
      const receptionDate = new Date(reception.date)
      return !Number.isNaN(receptionDate.getTime()) && receptionDate >= archiveCutoffDate
    })
  }, [archiveCutoffDate, receptions])

  const receptionsArchivees = useMemo(() => {
    return receptions.filter(reception => {
      const receptionDate = new Date(reception.date)
      return !Number.isNaN(receptionDate.getTime()) && receptionDate < archiveCutoffDate
    })
  }, [archiveCutoffDate, receptions])

  const previewKind = getFileKind(previewReception?.document_path)

  const exportReceptionDocument = async reception => {
    if (!reception?.document_path || !isElectron) return

    try {
      const exportedPath = await window.api.documentsExport(reception.document_path)
      if (exportedPath) {
        toast(`Document exporte : ${exportedPath.split(/[\\/]/).pop()}.`, 'success')
      }
    } catch (nextError) {
      setError(nextError.message || 'Impossible d exporter le document de reception.')
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <select
          value={stage}
          onChange={e => setStage(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white w-full sm:w-72"
        >
          {STAGE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => openNewCommande()}
          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle commande
        </button>
        <button onClick={async () => {
          try { const r = await window.api.exportCsv('commandes'); if (r?.success) toast('Export CSV enregistre.', 'success'); else toast('Export annule.', 'info') }
          catch (e) { toast(e.message, 'error') }
        }}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">A commander</div>
          <div className="text-2xl font-bold mt-3 text-white tabular-nums">{produitsACommander.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">En attente</div>
          <div className="text-2xl font-bold mt-3 text-amber-300 tabular-nums">{commandesEnAttente.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Receptions</div>
          <div className="text-2xl font-bold mt-3 text-green-300 tabular-nums">{receptions.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Stock suivi</div>
          <div className="text-2xl font-bold mt-3 text-sky-300 tabular-nums">{produits.length}</div>
        </div>
      </div>

      {showCommandeForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white">
                {editingCommandeId ? 'Modifier une commande' : 'Nouvelle commande fournisseur'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Une commande peut etre corrigee meme apres validation.
              </p>
            </div>

            {editingCommandeId && commandeInfo && (
              <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3 text-sm text-sky-100 max-w-xl">
                <div className="font-medium">
                  Edition de {commandeInfo.reference_commande || `commande #${editingCommandeId}`}
                </div>
                <div className="text-xs text-sky-200/80 mt-1">
                  {commandeInfo.fournisseur_nom || 'Fournisseur non renseigne'}
                  {commandeInfo.lignes_recues > 0 ? ` - ${commandeInfo.lignes_recues} ligne${commandeInfo.lignes_recues > 1 ? 's' : ''} deja recues` : ' - aucune reception encore liee'}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Date commande *</label>
              <input type="date" value={commandeForm.date_commande} onChange={e => setCommandeForm(current => ({ ...current, date_commande: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Reception prevue</label>
              <input type="date" value={commandeForm.date_prevue} onChange={e => setCommandeForm(current => ({ ...current, date_prevue: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur *</label>
              <select value={commandeForm.fournisseur_id} onChange={e => setCommandeForm(current => ({ ...current, fournisseur_id: Number(e.target.value) || '' }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">- Selectionner -</option>
                {fournisseurs.map(fournisseur => <option key={fournisseur.id} value={fournisseur.id}>{fournisseur.nom}</option>)}
              </select>
            </div>
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Ref. commande</label>
              <input type="text" value={commandeForm.reference_commande} onChange={e => setCommandeForm(current => ({ ...current, reference_commande: e.target.value }))} placeholder="CMD-2026-001" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Statut</label>
              <select value={commandeForm.statut} onChange={e => setCommandeForm(current => ({ ...current, statut: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 xl:col-span-12">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <input type="text" value={commandeForm.notes} onChange={e => setCommandeForm(current => ({ ...current, notes: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Produits commandes</span>
              <button onClick={addCommandeItem} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Ajouter une ligne
              </button>
            </div>

            {(() => { const hasReceivedCol = editingCommandeId && commandeForm.items.some(i => Number(i.quantite_recue || 0) > 0); return (
            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full min-w-[860px] xl:min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: hasReceivedCol ? '38%' : '46%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  {hasReceivedCol && <col style={{ width: '12%' }} />}
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '4%' }} />
                </colgroup>
                <thead className="bg-slate-750">
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-3">Produit</th>
                    <th className="text-left py-2 px-2">Unite</th>
                    <th className="text-right py-2 px-2">Commande</th>
                    {hasReceivedCol && <th className="text-center py-2 px-2">Recu</th>}
                    <th className="text-right py-2 px-2">Prix unit. HT</th>
                    <th className="text-right py-2 px-2">Total HT</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="bg-slate-800">
                  {commandeForm.items.length === 0 ? (
                    <tr><td colSpan={hasReceivedCol ? 7 : 6} className="text-center py-6 text-slate-500 text-xs">Ajoute les produits commandes pour suivre ce qui doit arriver.</td></tr>
                  ) : (
                    commandeForm.items.map((item, index) => <CommandeLineItem key={index} item={item} produits={produits} remises={commandeRemises} showReceivedCol={hasReceivedCol} onChange={value => updateCommandeItem(index, value)} onRemove={() => removeCommandeItem(index)} />)
                  )}
                </tbody>
                {commandeForm.items.length > 0 && (
                  <tfoot className="bg-slate-750 border-t border-slate-700">
                    <tr>
                      <td colSpan={hasReceivedCol ? 5 : 4} className="py-2 px-3 text-right text-sm font-semibold text-slate-300">Total commande :</td>
                      <td className="py-2 px-2 text-right text-sm font-bold text-white whitespace-nowrap tabular-nums">{formatMoney(formCommandeTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            )})()}
            {commandeRemises.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Remises fournisseur :</span>
                {commandeRemises.map(r => (
                  <span key={r.id} className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    -{r.remise_pourcent}% des {r.seuil_quantite} unites
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={closeCommandeForm} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">Annuler</button>
            <button onClick={saveCommande} disabled={savingCommande || !commandeForm.fournisseur_id || commandeForm.items.length === 0} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {savingCommande ? 'Enregistrement...' : editingCommandeId ? 'Mettre a jour la commande' : 'Valider la commande'}
            </button>
          </div>
        </div>
      )}

      {showReceptionForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h3 className="font-semibold text-white">{editingReceptionId ? 'Modifier une reception' : 'Enregistrer une reception'}</h3>
              <p className="text-xs text-slate-500 mt-1">Une reception modifie le stock reel et peut maintenant etre corrigee apres validation.</p>
            </div>

            {receptionInfo && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-sm text-green-100 max-w-xl">
                <div className="font-medium">
                  {receptionInfo.type === 'partielle'
                    ? `Suite de reception pour ${receptionInfo.reference || 'la commande'}`
                    : receptionInfo.type === 'commande'
                      ? `Reception preparee depuis ${receptionInfo.reference || 'la commande'}`
                      : `Edition de ${receptionInfo.reference || `reception #${editingReceptionId}`}`}
                </div>
                <div className="text-xs text-green-200/80 mt-1">
                  {receptionInfo.fournisseur_nom || 'Fournisseur non renseigne'}
                  {receptionInfo.date_prevue ? ` - prevue le ${new Date(receptionInfo.date_prevue).toLocaleDateString('fr-FR')}` : ''}
                  {receptionInfo.date ? ` - du ${new Date(receptionInfo.date).toLocaleDateString('fr-FR')}` : ''}
                  {receptionInfo.lignes_restantes ? ` - ${receptionInfo.lignes_restantes} ligne${receptionInfo.lignes_restantes > 1 ? 's' : ''} restante${receptionInfo.lignes_restantes > 1 ? 's' : ''}` : ''}
                  {receptionInfo.nb_passages > 0 ? ` - deja faite en ${receptionInfo.nb_passages} fois` : ''}
                  {receptionInfo.derniere_reception_date ? ` - dernier passage le ${new Date(receptionInfo.derniere_reception_date).toLocaleDateString('fr-FR')}` : ''}
                </div>
              </div>
            )}
          </div>

          {receptionForm.append_to_reception_id && !editingReceptionId && (
            <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl px-4 py-3 text-sm text-sky-100">
              Cette validation sera fusionnee avec la reception deja commencee pour cette commande, tout en gardant l historique des passages.
            </div>
          )}
          <div className="grid grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="col-span-2 xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Date *</label>
              <input type="date" value={receptionForm.date} onChange={e => setReceptionForm(current => ({ ...current, date: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="col-span-2 xl:col-span-6">
              <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur *</label>
              <select value={receptionForm.fournisseur_id} onChange={e => setReceptionForm(current => ({ ...current, fournisseur_id: Number(e.target.value) || '' }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                <option value="">- Selectionner -</option>
                {fournisseurs.map(fournisseur => <option key={fournisseur.id} value={fournisseur.id}>{fournisseur.nom}</option>)}
              </select>
            </div>
            <div className="col-span-2 xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Ref. BL</label>
              <input type="text" value={receptionForm.reference_bl} onChange={e => setReceptionForm(current => ({ ...current, reference_bl: e.target.value }))} placeholder="BL-2026-001" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="col-span-2 xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Ref. facture</label>
              <input type="text" value={receptionForm.reference_facture} onChange={e => setReceptionForm(current => ({ ...current, reference_facture: e.target.value }))} placeholder="FAC-2026-001" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="col-span-2 xl:col-span-6">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <input type="text" value={receptionForm.notes} onChange={e => setReceptionForm(current => ({ ...current, notes: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div className="col-span-2 xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Document (PDF)</label>
              <button onClick={pickReceptionFile} className="w-full bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-300 text-left truncate transition-colors">
                {receptionForm.document_path ? receptionForm.document_path.split(/[\\/]/).pop() : 'Attacher un fichier...'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">Produits recus</span>
              <div className="flex items-center gap-3">
                {receptionForm.items.some(i => i.quantite_commandee > 0) && (
                  <button
                    onClick={() => setReceptionForm(f => ({
                      ...f,
                      items: f.items.map(i => i.quantite_commandee > 0 ? { ...i, quantite: i.quantite_commandee } : i)
                    }))}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Reception complete
                  </button>
                )}
                <button onClick={addReceptionItem} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Ajouter une ligne
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full min-w-[940px] xl:min-w-[1080px] table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '28%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '2%' }} />
                </colgroup>
                <thead className="bg-slate-750">
                  <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-3">Produit</th>
                    <th className="text-left py-2 px-2">Unite</th>
                    <th className="text-right py-2 px-2">Qte</th>
                    <th className="text-right py-2 px-2">Prix unit. HT</th>
                    <th className="text-left py-2 px-2">No lot</th>
                    <th className="text-left py-2 px-2">Expiration</th>
                    <th className="text-right py-2 px-2">Total HT</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="bg-slate-800">
                  {receptionForm.items.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-6 text-slate-500 text-xs">Ajoute les produits recus pour enregistrer cette livraison.</td></tr>
                  ) : (
                    receptionForm.items.map((item, index) => <ReceptionLineItem key={index} item={item} produits={produits} onChange={value => updateReceptionItem(index, value)} onRemove={() => removeReceptionItem(index)} />)
                  )}
                </tbody>
                {receptionForm.items.length > 0 && (
                  <tfoot className="bg-slate-750 border-t border-slate-700">
                    <tr>
                      <td colSpan={6} className="py-2 px-3 text-right text-sm font-semibold text-slate-300">Total HT :</td>
                      <td className="py-2 px-2 text-right text-sm font-bold text-white whitespace-nowrap tabular-nums">{formatMoney(formReceptionTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={closeReceptionForm} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">Annuler</button>
            <button onClick={saveReception} disabled={savingReception || !receptionForm.fournisseur_id || receptionForm.items.length === 0} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {savingReception ? 'Enregistrement...' : editingReceptionId ? 'Mettre a jour la reception' : 'Valider la reception'}
            </button>
          </div>
        </div>
      )}

      {stage === 'A_FAIRE' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Commande a faire</h3>
              <p className="text-xs text-slate-500 mt-1">Vue alertes stock ou conseils de commande pour preparer plus vite l achat.</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-lg p-1">
              <button
                onClick={() => setCommandePlanningView('ALERTES')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  commandePlanningView === 'ALERTES'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Alertes stock
              </button>
              <button
                onClick={() => setCommandePlanningView('CONSEILS')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  commandePlanningView === 'CONSEILS'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Conseils de commande
              </button>
            </div>
          </div>

          {commandePlanningView === 'ALERTES' ? (
            <div className="divide-y divide-slate-700/50">
              {produitsACommander.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">Aucun besoin de commande pour le moment.</div>
              ) : (
                produitsACommander.map(produit => (
                  <div key={produit.id} className="flex flex-col lg:flex-row lg:items-center gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">{produit.nom}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {produit.reference || 'Sans reference'}
                        {produit.categorie ? ` - ${produit.categorie}` : ''}
                        {produit.fournisseur_nom ? ` - ${produit.fournisseur_nom}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <div className="text-xs text-slate-500">Stock actuel</div>
                      <div className="text-sm font-semibold text-red-300 whitespace-nowrap tabular-nums">{Number(produit.stock_actuel || 0)} {produit.unite}</div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">Seuil {Number(produit.stock_minimum || 0)}</div>
                    </div>
                    <div className="shrink-0">
                      <button onClick={() => openNewCommande(produit)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                        Commander
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Produits conseilles</div>
                  <div className="text-2xl font-bold text-white mt-3 tabular-nums">{produitsACommander.length}</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Budget estime</div>
                  <div className="text-2xl font-bold text-emerald-300 mt-3 tabular-nums">{formatMoney(budgetConseille)}</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Principe</div>
                  <div className="text-sm text-slate-300 mt-3">Le conseil remonte au minimum puis ajoute une petite marge de securite pour eviter une nouvelle rupture trop vite.</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full min-w-[940px] xl:min-w-[1080px] table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '26%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                  </colgroup>
                  <thead className="bg-slate-750">
                    <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                      <th className="text-left py-3 px-3">Produit</th>
                      <th className="text-left py-3 px-3">Fournisseur</th>
                      <th className="text-right py-3 px-3">Stock</th>
                      <th className="text-right py-3 px-3">Seuil</th>
                      <th className="text-right py-3 px-3">Mini</th>
                      <th className="text-right py-3 px-3">Conseil</th>
                      <th className="text-right py-3 px-3">Estime</th>
                      <th className="text-center py-3 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50 bg-slate-800">
                    {produitsACommander.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-500">Aucun conseil de commande pour le moment.</td>
                      </tr>
                    ) : (
                      produitsACommander.map(produit => (
                        <tr key={produit.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="text-white font-medium">{produit.nom}</div>
                            <div className="text-xs text-slate-400 mt-1">{produit.reference || 'Sans reference'}{produit.categorie ? ` - ${produit.categorie}` : ''}</div>
                          </td>
                          <td className="py-3 px-3 text-slate-300">{produit.fournisseur_nom || 'A renseigner'}</td>
                          <td className="py-3 px-3 text-right text-red-300 whitespace-nowrap tabular-nums">{Number(produit.stock_actuel || 0)}</td>
                          <td className="py-3 px-3 text-right text-slate-300 whitespace-nowrap tabular-nums">{Number(produit.stock_minimum || 0)}</td>
                          <td className="py-3 px-3 text-right text-amber-300 whitespace-nowrap tabular-nums">{produit.quantite_minimum}</td>
                          <td className="py-3 px-3 text-right text-emerald-300 whitespace-nowrap tabular-nums">{produit.quantite_conseillee}</td>
                          <td className="py-3 px-3 text-right text-white whitespace-nowrap tabular-nums">{formatMoney(produit.montant_estime)}</td>
                          <td className="py-3 px-3 text-center">
                            <button onClick={() => openNewCommande(produit)} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
                              Preparer
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 'EN_ATTENTE' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
          <div className="px-5 py-4 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-white">Commandes en attente de reception</h3>
          </div>
          <div className="divide-y divide-slate-700/50">
            {commandesEnAttente.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">Aucune commande en attente.</div>
            ) : (
              commandesEnAttente.map(commande => (
                <div key={commande.id} className="flex flex-col lg:flex-row lg:items-center gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[commande.statut] || STATUS_COLORS.EN_ATTENTE}`}>{STATUS_LABELS[commande.statut] || commande.statut}</span>
                      {commande.reference_commande && <span className="text-sm font-medium text-white truncate" title={commande.reference_commande}>{commande.reference_commande}</span>}
                    </div>
                    <div className="text-sm font-medium text-white mt-2 truncate">{commande.fournisseur_nom || 'Fournisseur non renseigne'}</div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Commandee le {new Date(commande.date_commande).toLocaleDateString('fr-FR')}</span>
                      {commande.date_prevue && <span>Prevue le {new Date(commande.date_prevue).toLocaleDateString('fr-FR')}</span>}
                      <span>{commande.nb_produits || 0} produit{commande.nb_produits > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="text-xs text-slate-500">Montant estime</div>
                    <div className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">{formatMoney(commande.montant_total)}</div>
                    {commande.statut === 'PARTIELLE' && Number(commande.nb_passages || 0) > 0 && (
                      <div className="text-xs text-sky-300 mt-1 whitespace-nowrap">
                        reception en {commande.nb_passages} fois
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button onClick={() => openEditCommande(commande.id)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">Modifier</button>
                    <button onClick={async () => {
                      try {
                        const result = await window.api.commandesExportPdf(commande.id)
                        if (result?.success) toast('Bon de commande exporte.', 'success')
                      } catch (e) { toast(e.message, 'error') }
                    }} className="bg-sky-600/20 hover:bg-sky-600/40 text-sky-400 hover:text-sky-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors">PDF</button>
                    <button onClick={() => deleteCommande(commande.id)} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors">Supprimer</button>
                    <button onClick={() => openReceptionFromCommande(commande.id)} className="bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">Receptionner</button>
                    {commande.statut === 'PARTIELLE' ? (
                      <select
                        defaultValue=""
                        onChange={e => {
                          const action = e.target.value
                          if (action === 'CONTINUER') {
                            openReceptionFromCommande(commande.id)
                          }
                          if (action === 'VOIR' && commande.active_reception_id) {
                            openEditReception(commande.active_reception_id)
                          }
                          e.target.value = ''
                        }}
                        className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white"
                      >
                        <option value="">Partielle...</option>
                        <option value="CONTINUER">Finir la reception</option>
                        <option value="VOIR" disabled={!commande.active_reception_id}>Voir la reception</option>
                      </select>
                    ) : (
                      <select value={commande.statut} onChange={e => updateCommandeStatus(commande.id, e.target.value)} className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white">
                        {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {stage === 'RECEPTIONNEES' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Historique des receptions recentes</h3>
              <p className="text-xs text-slate-500 mt-1">Affiche les receptions du dernier mois glissant, soit depuis le {archiveCutoffLabel}.</p>
            </div>
            <button onClick={openManualReception} className="text-sm text-green-300 hover:text-green-200 bg-green-500/10 hover:bg-green-500/20 px-4 py-2 rounded-lg transition-colors">Nouvelle reception manuelle</button>
          </div>
          <div className="divide-y divide-slate-700/50">
            {receptionsRecentes.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">Aucune reception enregistree.</div>
            ) : (
              receptionsRecentes.map(reception => (
                <div key={reception.id} className="flex flex-col lg:flex-row lg:items-center gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{reception.fournisseur_nom}</div>
                    <div className="text-xs text-slate-400 mt-1">{reception.reference_bl ? `${reception.reference_bl} - ` : ''}{new Date(reception.date).toLocaleDateString('fr-FR')}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      {reception.nb_produits} produit{reception.nb_produits > 1 ? 's' : ''}
                      {Number(reception.nb_passages || 0) > 1 ? ` - faite en ${reception.nb_passages} fois` : ''}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="text-left 2xl:text-right">
                      <div className="text-xs text-slate-500">Montant</div>
                      <div className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">{formatMoney(reception.montant_total)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => openEditReception(reception.id)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Modifier</button>
                    {reception.document_path ? (
                      <>
                        <button onClick={() => setPreviewReception(reception)} className="text-sm text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-lg transition-colors">
                          Previsualiser
                        </button>
                        <button onClick={() => exportReceptionDocument(reception)} className="text-sm text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 rounded-lg transition-colors">
                          Exporter
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">Pas de document joint</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {stage === 'ARCHIVEES' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-white">Receptions archivees</h3>
            <p className="text-xs text-slate-500 mt-1">Toutes les receptions anterieures au {archiveCutoffLabel} passent automatiquement dans cette vue archivee.</p>
          </div>
          <div className="divide-y divide-slate-700/50">
            {receptionsArchivees.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">Aucune reception archivee.</div>
            ) : (
              receptionsArchivees.map(reception => (
                <div key={reception.id} className="flex flex-col lg:flex-row lg:items-center gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">{reception.fournisseur_nom}</div>
                    <div className="text-xs text-slate-400 mt-1">{reception.reference_bl ? `${reception.reference_bl} - ` : ''}{new Date(reception.date).toLocaleDateString('fr-FR')}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      {reception.nb_produits} produit{reception.nb_produits > 1 ? 's' : ''}
                      {Number(reception.nb_passages || 0) > 1 ? ` - faite en ${reception.nb_passages} fois` : ''}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="text-left 2xl:text-right">
                      <div className="text-xs text-slate-500">Montant</div>
                      <div className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">{formatMoney(reception.montant_total)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => openEditReception(reception.id)} className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Modifier</button>
                    {reception.document_path ? (
                      <>
                        <button onClick={() => setPreviewReception(reception)} className="text-sm text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-lg transition-colors">
                          Previsualiser
                        </button>
                        <button onClick={() => exportReceptionDocument(reception)} className="text-sm text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 rounded-lg transition-colors">
                          Exporter
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">Pas de document joint</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {stage === 'RETOURS' && (
        <div className="space-y-4">
          {showRetourForm ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">Nouveau retour fournisseur</h3>
                <button onClick={() => setShowRetourForm(false)} className="text-slate-400 hover:text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                  <input type="date" value={retourForm.date} onChange={e => setRetourForm(f => ({ ...f, date: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur *</label>
                  <select value={retourForm.fournisseur_id} onChange={e => setRetourForm(f => ({ ...f, fournisseur_id: Number(e.target.value) || '' }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">- Choisir -</option>
                    {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Motif</label>
                  <select value={retourForm.motif} onChange={e => setRetourForm(f => ({ ...f, motif: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
                    <option value="">- Motif -</option>
                    <option value="Defectueux">Defectueux</option>
                    <option value="Perime">Perime</option>
                    <option value="Erreur commande">Erreur commande</option>
                    <option value="Rappel fabricant">Rappel fabricant</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
                  <input type="text" value={retourForm.notes} onChange={e => setRetourForm(f => ({ ...f, notes: e.target.value }))} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-white">Produits retournes</span>
                  <button onClick={addRetourItem} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Ajouter un produit
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-medium text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-3">Produit</th>
                        <th className="text-left py-2 px-2">Unite</th>
                        <th className="text-right py-2 px-2">Quantite</th>
                        <th className="text-right py-2 px-2">Prix unit.</th>
                        <th className="text-right py-2 px-2">Total</th>
                        <th className="py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {retourForm.items.map((item, idx) => {
                        const prod = produits.find(p => p.id === item.produit_id) || {}
                        return (
                          <tr key={idx} className="border-b border-slate-700/50">
                            <td className="py-2 px-3">
                              <ProductSearchInput produits={produits} value={item.produit_id} onChange={p => updateRetourItem(idx, { ...item, produit_id: p ? p.id : '', prix_unitaire: p ? p.prix_unitaire : 0 })} placeholder="Rechercher..." />
                            </td>
                            <td className="py-2 px-2 text-xs text-slate-400">{prod.unite || '-'}</td>
                            <td className="py-2 px-2"><input type="number" min="1" value={item.quantite} onChange={e => updateRetourItem(idx, { ...item, quantite: Number(e.target.value) })} className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white text-right" /></td>
                            <td className="py-2 px-2"><input type="number" min="0" step="0.01" value={item.prix_unitaire} onChange={e => updateRetourItem(idx, { ...item, prix_unitaire: Number(e.target.value) })} className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-white text-right" /></td>
                            <td className="py-2 px-2 text-right text-sm text-slate-300 tabular-nums">{formatMoney((item.quantite || 0) * (item.prix_unitaire || 0))}</td>
                            <td className="py-2"><button onClick={() => removeRetourItem(idx)} className="text-slate-500 hover:text-red-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowRetourForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700">Annuler</button>
                <button onClick={saveRetour} disabled={savingRetour || !retourForm.fournisseur_id || retourForm.items.length === 0} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg">
                  {savingRetour ? 'Enregistrement...' : 'Valider le retour'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Retours fournisseur</h3>
                  <p className="text-xs text-slate-500 mt-1">Historique des produits retournes aux fournisseurs.</p>
                </div>
                <button onClick={() => { setShowRetourForm(true); setRetourForm({ date: new Date().toISOString().split('T')[0], fournisseur_id: '', motif: '', notes: '', items: [] }) }} className="text-sm text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-lg transition-colors">Nouveau retour</button>
              </div>
              <div className="divide-y divide-slate-700/50">
                {retours.length === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-slate-500">Aucun retour enregistre.</div>
                ) : retours.map(r => (
                  <div key={r.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-white font-medium">{r.fournisseur_nom || 'Fournisseur inconnu'}</div>
                      <div className="text-xs text-slate-500">{new Date(r.date).toLocaleDateString('fr-FR')} — {r.motif || 'Sans motif'} — {r.nb_produits} produit{r.nb_produits > 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-sm font-medium text-red-400 tabular-nums">-{formatMoney(r.montant_total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {previewReception && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 md:p-8">
          <div className="w-full h-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {previewReception.reference_bl || 'Document de reception'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {previewReception.fournisseur_nom || 'Fournisseur non renseigne'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => exportReceptionDocument(previewReception)}
                  className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 rounded-lg transition-colors"
                >
                  Exporter
                </button>
                <button
                  onClick={() => window.api.documentsOpen(previewReception.document_path)}
                  className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-2 rounded-lg transition-colors"
                >
                  Ouvrir
                </button>
                <button
                  onClick={() => setPreviewReception(null)}
                  className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950">
              {previewLoading ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                  Chargement du document...
                </div>
              ) : previewKind === 'pdf' && previewDataUrl ? (
                <iframe title={previewReception.reference_bl || 'Preview'} src={previewDataUrl} className="w-full h-full bg-white" />
              ) : previewKind === 'image' && previewDataUrl ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-6">
                  <img src={previewDataUrl} alt={previewReception.reference_bl || 'Document'} className="max-w-full max-h-full rounded-xl shadow-2xl" />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center text-slate-400 px-6">
                  <div className="text-sm">Impossible d afficher ce document directement ici.</div>
                  <div className="text-xs text-slate-500 mt-2">Utilise Ouvrir ou Exporter pour consulter le fichier.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {partialAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Reception incomplete</h3>
                <p className="text-slate-400 text-sm mt-1">Certains produits n'ont pas ete entierement recus :</p>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-700">
                    <th className="text-left py-2 px-3 font-medium">Produit</th>
                    <th className="text-right py-2 px-3 font-medium">Attendu</th>
                    <th className="text-right py-2 px-3 font-medium">Recu</th>
                    <th className="text-right py-2 px-3 font-medium">Manquant</th>
                  </tr>
                </thead>
                <tbody>
                  {partialAlert.incomplete.map((item, i) => (
                    <tr key={i} className="border-b border-slate-700/50">
                      <td className="py-1.5 px-3 text-slate-300">{item.nom}</td>
                      <td className="py-1.5 px-3 text-right text-slate-400 tabular-nums">{item.commandee}</td>
                      <td className="py-1.5 px-3 text-right text-amber-400 tabular-nums">{item.recue}</td>
                      <td className="py-1.5 px-3 text-right text-red-400 tabular-nums">{item.commandee - item.recue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-slate-400 text-sm">Que souhaitez-vous faire ?</p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => doSaveReception(false)}
                disabled={savingReception}
                className="w-full flex items-center gap-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Reception partielle — je recevrai le reste plus tard
              </button>
              <button
                onClick={() => doSaveReception(true)}
                disabled={savingReception}
                className="w-full flex items-center gap-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Modifier la commande — ajuster les quantites a ce que j'ai recu
              </button>
              <button
                onClick={() => setPartialAlert(null)}
                className="w-full text-slate-400 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
