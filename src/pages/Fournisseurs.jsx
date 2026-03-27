import { useEffect, useMemo, useState } from 'react'

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
  const [produits, setProduits] = useState([])
  const [form, setForm] = useState(createEmptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)

  const load = async () => {
    if (isElectron) {
      const [nextFournisseurs, nextProduits] = await Promise.all([
        window.api.fournisseursList(),
        window.api.produitsList(),
      ])

      setFournisseurs(nextFournisseurs)
      setProduits(nextProduits)
      return
    }

    setFournisseurs(DEMO_FOURNISSEURS)
    setProduits(DEMO_PRODUITS)
  }

  useEffect(() => {
    load()
  }, [])

  const clearMessageLater = nextMessage => {
    setMessage(nextMessage)
    window.clearTimeout(clearMessageLater.timer)
    clearMessageLater.timer = window.setTimeout(() => setMessage(null), 3200)
  }

  const produitCountByFournisseur = useMemo(() => {
    return produits.reduce((accumulator, produit) => {
      const supplierId = Number(produit.fournisseur_id || 0)
      if (!supplierId) return accumulator
      accumulator[supplierId] = (accumulator[supplierId] || 0) + 1
      return accumulator
    }, {})
  }, [produits])

  const filteredFournisseurs = useMemo(() => {
    if (!search.trim()) return fournisseurs

    const query = search.toLowerCase()
    return fournisseurs.filter(fournisseur => {
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
  }, [fournisseurs, search])

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
      clearMessageLater({
        tone: 'success',
        text: editingId ? 'Fournisseur mis a jour.' : 'Fournisseur ajoute.',
      })
      resetForm()
    } catch (error) {
      clearMessageLater({
        tone: 'error',
        text: error.message || 'Impossible d enregistrer le fournisseur.',
      })
    } finally {
      setSaving(false)
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-w-0">
            <input
              type="text"
              placeholder="Rechercher un fournisseur, un mail, un contact..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="lg:col-span-2 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
            />

            <div className="flex items-center text-sm text-slate-400 px-3">
              {filteredFournisseurs.length} fournisseur{filteredFournisseurs.length > 1 ? 's' : ''}
            </div>
          </div>

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
        </div>
      </div>

      {showForm && (
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

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
        {filteredFournisseurs.length === 0 ? (
          <div className="xl:col-span-2 bg-slate-800 rounded-xl border border-slate-700 py-12 text-center text-slate-500">
            Aucun fournisseur trouve.
          </div>
        ) : (
          filteredFournisseurs.map(fournisseur => (
            <div key={fournisseur.id} className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white truncate" title={fournisseur.nom}>
                    {fournisseur.nom}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {produitCountByFournisseur[fournisseur.id] || 0} produit{(produitCountByFournisseur[fournisseur.id] || 0) > 1 ? 's' : ''} rattache{(produitCountByFournisseur[fournisseur.id] || 0) > 1 ? 's' : ''}
                  </div>
                </div>

                <button
                  onClick={() => openEditor(fournisseur)}
                  className="shrink-0 text-xs text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Modifier
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60 min-w-0">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Contact commercial</div>
                  <div className="text-slate-200 mt-2 break-words">{fournisseur.contact_commercial || '-'}</div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60 min-w-0">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Telephone</div>
                  <div className="text-slate-200 mt-2 break-words">{fournisseur.telephone || '-'}</div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60 min-w-0">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Email</div>
                  <div className="text-slate-200 mt-2 break-words">{fournisseur.email || '-'}</div>
                </div>

                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/60 min-w-0 md:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Adresse</div>
                  <div className="text-slate-200 mt-2 break-words">{fournisseur.adresse || '-'}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
