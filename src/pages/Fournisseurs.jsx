import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_FOURNISSEURS = [
  {
    id: 1,
    nom: 'Henry Schein',
    contact_commercial: 'Claire Bernard',
    email: 'contact@henryschein.fr',
    telephone: '01 23 45 67 89',
    adresse: '10 rue des Fournisseurs, 75010 Paris',
  },
  {
    id: 2,
    nom: 'Gacd',
    contact_commercial: 'Marc Delorme',
    email: 'commandes@gacd.fr',
    telephone: '01 98 76 54 32',
    adresse: '25 avenue du Depot, 69000 Lyon',
  },
]

const DEMO_PRODUITS = [
  { id: 1, fournisseur_id: 1 },
  { id: 2, fournisseur_id: 1 },
  { id: 3, fournisseur_id: 1 },
  { id: 4, fournisseur_id: 2 },
]

function createEmptyForm() {
  return {
    nom: '',
    contact_commercial: '',
    email: '',
    telephone: '',
    adresse: '',
  }
}

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState([])
  const [archivedFournisseurs, setArchivedFournisseurs] = useState([])
  const [produits, setProduits] = useState([])
  const [form, setForm] = useState(createEmptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const { toast, confirm } = useToast()
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('actifs')

  const load = async () => {
    if (isElectron) {
      const [nextFournisseurs, nextArchived, nextProduits] = await Promise.all([
        window.api.fournisseursList(),
        window.api.fournisseursListArchived(),
        window.api.produitsList(),
      ])

      setFournisseurs(nextFournisseurs)
      setArchivedFournisseurs(nextArchived)
      setProduits(nextProduits)
      return
    }

    setFournisseurs(DEMO_FOURNISSEURS)
    setProduits(DEMO_PRODUITS)
  }

  useEffect(() => {
    load()
  }, [])


  const produitCountByFournisseur = useMemo(() => {
    return produits.reduce((accumulator, produit) => {
      const supplierId = Number(produit.fournisseur_id || 0)
      if (!supplierId) return accumulator
      accumulator[supplierId] = (accumulator[supplierId] || 0) + 1
      return accumulator
    }, {})
  }, [produits])

  const currentList = tab === 'archives' ? archivedFournisseurs : fournisseurs

  const filteredFournisseurs = useMemo(() => {
    if (!search.trim()) return currentList

    const query = search.toLowerCase()
    return currentList.filter(fournisseur => {
      const haystack = [
        fournisseur.nom,
        fournisseur.contact_commercial,
        fournisseur.email,
        fournisseur.telephone,
        fournisseur.adresse,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [currentList, search])

  const selectedFournisseur = currentList.find(f => f.id === selectedId) || null
  const [remises, setRemises] = useState([])
  const [showRemiseForm, setShowRemiseForm] = useState(false)
  const [remiseForm, setRemiseForm] = useState({ seuil_quantite: 0, remise_pourcent: 0, description: '' })

  useEffect(() => {
    if (selectedId && isElectron) {
      window.api.remisesList(selectedId).then(setRemises).catch(() => setRemises([]))
    } else {
      setRemises([])
    }
  }, [selectedId])

  const saveRemise = async () => {
    if (remiseForm.seuil_quantite <= 0 || remiseForm.remise_pourcent <= 0) return
    try {
      await window.api.remisesAdd({ fournisseur_id: selectedId, ...remiseForm })
      const r = await window.api.remisesList(selectedId)
      setRemises(r)
      setShowRemiseForm(false)
      setRemiseForm({ seuil_quantite: 0, remise_pourcent: 0, description: '' })
      toast('Remise ajoutee.', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const deleteRemise = async (id) => {
    try {
      await window.api.remisesDelete(id)
      const r = await window.api.remisesList(selectedId)
      setRemises(r)
      toast('Remise supprimee.', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const resetForm = () => {
    setForm(createEmptyForm())
    setEditingId(null)
    setShowForm(false)
  }

  const openEditor = fournisseur => {
    setForm({
      nom: fournisseur.nom || '',
      contact_commercial: fournisseur.contact_commercial || '',
      email: fournisseur.email || '',
      telephone: fournisseur.telephone || '',
      adresse: fournisseur.adresse || '',
    })
    setEditingId(fournisseur.id)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.nom.trim()) return

    setSaving(true)

    try {
      const payload = {
        nom: form.nom.trim(),
        contact_commercial: form.contact_commercial.trim(),
        email: form.email.trim(),
        telephone: form.telephone.trim(),
        adresse: form.adresse.trim(),
      }

      if (isElectron) {
        if (editingId) {
          await window.api.fournisseursUpdate(editingId, payload)
        } else {
          await window.api.fournisseursAdd(payload)
        }
      }

      await load()
      toast(editingId ? 'Fournisseur mis a jour.' : 'Fournisseur ajoute.', 'success')
      resetForm()
    } catch (error) {
      toast(error.message || 'Impossible d enregistrer le fournisseur.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const archiveFournisseur = async (fournisseur) => {
    if (!(await confirm(`Archiver "${fournisseur.nom}" ?`))) return
    try {
      if (isElectron) await window.api.fournisseursArchive(fournisseur.id)
      if (selectedId === fournisseur.id) setSelectedId(null)
      await load()
      toast(`"${fournisseur.nom}" archive.`, 'success')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  const restoreFournisseur = async (fournisseur) => {
    try {
      if (isElectron) await window.api.fournisseursRestore(fournisseur.id)
      if (selectedId === fournisseur.id) setSelectedId(null)
      await load()
      toast(`"${fournisseur.nom}" restaure.`, 'success')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  const deleteFournisseur = async (fournisseur) => {
    if (!(await confirm(`Supprimer definitivement "${fournisseur.nom}" ? Cette action est irreversible.`))) return
    try {
      if (isElectron) await window.api.fournisseursDelete(fournisseur.id)
      if (selectedId === fournisseur.id) setSelectedId(null)
      await load()
      toast(`"${fournisseur.nom}" supprime definitivement.`, 'success')
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  const exportCsv = async () => {
    try {
      const result = await window.api.exportCsv('fournisseurs')
      if (result?.success) toast('Export CSV enregistre.', 'success')
      else toast('Export annule.', 'info')
    } catch (e) { toast(e.message, 'error') }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-w-0">
            <input
              type="text"
              placeholder="Rechercher un fournisseur, un mail, un contact..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="lg:col-span-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
            />

            <div className="flex items-center gap-3">
              <div className="flex rounded-lg bg-slate-900/60 p-0.5">
                <button
                  onClick={() => { setTab('actifs'); setSelectedId(null) }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'actifs' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Actifs ({fournisseurs.length})
                </button>
                <button
                  onClick={() => { setTab('archives'); setSelectedId(null) }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'archives' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Archives ({archivedFournisseurs.length})
                </button>
              </div>
            </div>
          </div>

          {tab === 'actifs' && (<>
            <button
              onClick={() => {
                setForm(createEmptyForm())
                setEditingId(null)
                setShowForm(current => !current)
              }}
              className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau fournisseur
            </button>
            <button onClick={exportCsv}
              className="flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export CSV
            </button>
          </>)}
        </div>
      </div>

      {showForm && tab === 'actifs' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-white">
              {editingId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Coordonnees utilisees pour les commandes, relances et receptions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
              <input
                type="text"
                value={form.nom}
                onChange={e => setForm(current => ({ ...current, nom: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Contact commercial</label>
              <input
                type="text"
                value={form.contact_commercial}
                onChange={e => setForm(current => ({ ...current, contact_commercial: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Telephone</label>
              <input
                type="text"
                value={form.telephone}
                onChange={e => setForm(current => ({ ...current, telephone: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-5">
              <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(current => ({ ...current, email: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-7">
              <label className="block text-xs font-medium text-slate-400 mb-1">Adresse</label>
              <input
                type="text"
                value={form.adresse}
                onChange={e => setForm(current => ({ ...current, adresse: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
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
              disabled={saving || !form.nom.trim()}
              className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Enregistrement...' : editingId ? 'Mettre a jour' : 'Ajouter le fournisseur'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {filteredFournisseurs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              {tab === 'archives' ? 'Aucun fournisseur archive.' : 'Aucun fournisseur trouve.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/60">
              {filteredFournisseurs.map(fournisseur => {
                const isSelected = selectedId === fournisseur.id
                const count = produitCountByFournisseur[fournisseur.id] || 0
                return (
                  <li
                    key={fournisseur.id}
                    onClick={() => setSelectedId(isSelected ? null : fournisseur.id)}
                    className={`flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-rose-500/10 border-l-2 border-rose-500'
                        : 'hover:bg-slate-700/40 border-l-2 border-transparent'
                    } ${tab === 'archives' ? 'opacity-70' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className={`text-sm font-medium truncate ${isSelected ? 'text-rose-200' : 'text-white'}`}>
                        {fournisseur.nom}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {tab === 'archives' ? 'Archive' : `${count} produit${count > 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <svg className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'text-rose-400 rotate-90' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {selectedFournisseur ? (
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedFournisseur.nom}</h3>
                <div className="text-xs text-slate-500 mt-1">
                  {produitCountByFournisseur[selectedFournisseur.id] || 0} produit{(produitCountByFournisseur[selectedFournisseur.id] || 0) > 1 ? 's' : ''} rattache{(produitCountByFournisseur[selectedFournisseur.id] || 0) > 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {tab === 'actifs' ? (
                  <>
                    <button
                      onClick={() => openEditor(selectedFournisseur)}
                      className="text-xs text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => archiveFournisseur(selectedFournisseur)}
                      className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Archiver
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => restoreFournisseur(selectedFournisseur)}
                      className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Restaurer
                    </button>
                    <button
                      onClick={() => deleteFournisseur(selectedFournisseur)}
                      className="text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60">
                <div className="text-xs uppercase tracking-wide text-slate-500">Contact commercial</div>
                <div className="text-slate-200 mt-2 break-words">{selectedFournisseur.contact_commercial || '-'}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60">
                <div className="text-xs uppercase tracking-wide text-slate-500">Telephone</div>
                <div className="text-slate-200 mt-2 break-words">{selectedFournisseur.telephone || '-'}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60">
                <div className="text-xs uppercase tracking-wide text-slate-500">Email</div>
                <div className="text-slate-200 mt-2 break-words">{selectedFournisseur.email || '-'}</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60">
                <div className="text-xs uppercase tracking-wide text-slate-500">Adresse</div>
                <div className="text-slate-200 mt-2 break-words">{selectedFournisseur.adresse || '-'}</div>
              </div>

              {/* Remises */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60 col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Remises par quantite</div>
                  <button onClick={() => setShowRemiseForm(!showRemiseForm)}
                    className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg">
                    + Ajouter
                  </button>
                </div>

                {showRemiseForm && (
                  <div className="flex items-end gap-2 mb-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-1">A partir de (unite)</label>
                      <input type="number" min="1" value={remiseForm.seuil_quantite} onChange={e => setRemiseForm(f => ({ ...f, seuil_quantite: Number(e.target.value) }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-1">Remise (%)</label>
                      <input type="number" min="0" max="100" step="0.5" value={remiseForm.remise_pourcent} onChange={e => setRemiseForm(f => ({ ...f, remise_pourcent: Number(e.target.value) }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-slate-400 mb-1">Description</label>
                      <input type="text" value={remiseForm.description} onChange={e => setRemiseForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white" placeholder="ex: Remise volume" />
                    </div>
                    <button onClick={saveRemise} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-lg shrink-0">OK</button>
                  </div>
                )}

                {remises.length === 0 ? (
                  <div className="text-xs text-slate-500">Aucune remise configuree.</div>
                ) : (
                  <div className="space-y-1.5">
                    {remises.map(r => (
                      <div key={r.id} className="flex items-center justify-between text-xs bg-slate-800 rounded-lg px-3 py-2 border border-slate-700">
                        <div>
                          <span className="text-white font-medium">-{r.remise_pourcent}%</span>
                          <span className="text-slate-400 ml-2">des {r.seuil_quantite} unites</span>
                          {r.description && <span className="text-slate-500 ml-2">({r.description})</span>}
                        </div>
                        <button onClick={() => deleteRemise(r.id)} className="text-slate-400 hover:text-red-400 p-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center py-16 text-slate-500 text-sm">
            Selectionnez un fournisseur pour voir ses details
          </div>
        )}
      </div>
    </div>
  )
}
