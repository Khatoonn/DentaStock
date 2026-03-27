import { useEffect, useMemo, useState } from 'react'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_DOCS = [
  { id: 1, type: 'FACTURE', date: '2026-03-25', reference: 'FAC-2026-0142', fournisseur_nom: 'Henry Schein', montant: 245.0, chemin_fichier: null, notes: '' },
  { id: 2, type: 'BL', date: '2026-03-25', reference: 'BL-2026-0142', fournisseur_nom: 'Henry Schein', montant: null, chemin_fichier: null, notes: '' },
  { id: 3, type: 'COMMANDE', date: '2026-03-20', reference: 'CMD-GACD-089', fournisseur_nom: 'Gacd', montant: 128.5, chemin_fichier: null, notes: '' },
]

const DEMO_FOURNISSEURS = [
  { id: 1, nom: 'Henry Schein' },
  { id: 2, nom: 'Gacd' },
]

const EMPTY_FORM = {
  type: 'FACTURE',
  date: new Date().toISOString().split('T')[0],
  reference: '',
  fournisseur_id: '',
  montant: '',
  notes: '',
  chemin_fichier: '',
}

const TYPE_LABELS = {
  BL: 'Bon de livraison',
  FACTURE: 'Facture',
  COMMANDE: 'Bon de commande',
}

const TYPE_COLORS = {
  BL: 'bg-sky-500/15 text-sky-400',
  FACTURE: 'bg-amber-500/15 text-amber-400',
  COMMANDE: 'bg-emerald-500/15 text-emerald-400',
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

function KpiCard({ value, label, color, icon }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 px-5 py-4 flex items-center gap-3 min-w-0">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-white whitespace-nowrap tabular-nums">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  )
}

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [fournisseurs, setFournisseurs] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState({ type: '', fournisseur: '', search: '' })
  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewDataUrl, setPreviewDataUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const load = async () => {
    if (isElectron) {
      const [nextDocs, nextFournisseurs] = await Promise.all([
        window.api.documentsList(),
        window.api.fournisseursList(),
      ])
      setDocs(nextDocs)
      setFournisseurs(nextFournisseurs)
      return
    }

    setDocs(DEMO_DOCS)
    setFournisseurs(DEMO_FOURNISSEURS)
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      if (!previewDoc?.chemin_fichier || !isElectron) {
        setPreviewDataUrl('')
        setPreviewLoading(false)
        return
      }

      setPreviewLoading(true)

      try {
        const fileData = await window.api.documentsRead(previewDoc.chemin_fichier)
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
  }, [previewDoc])

  const clearNoticeLater = message => {
    setNotice(message)
    window.clearTimeout(clearNoticeLater.timer)
    clearNoticeLater.timer = window.setTimeout(() => setNotice(''), 3200)
  }

  const pickFile = async () => {
    if (!isElectron) return

    const selectedPath = await window.api.dialogOpenFile([
      { name: 'PDF / Images', extensions: ['pdf', 'jpg', 'png', 'jpeg'] },
    ])

    if (selectedPath) {
      setForm(current => ({ ...current, chemin_fichier: selectedPath }))
    }
  }

  const save = async () => {
    if (!form.date || !form.type) return

    setSaving(true)

    if (isElectron) {
      await window.api.documentsAdd({
        ...form,
        fournisseur_id: form.fournisseur_id || null,
        montant: form.montant ? Number(form.montant) : null,
      })
    }

    setSaving(false)
    setSuccess(true)
    setForm(EMPTY_FORM)
    setShowForm(false)
    await load()
    setTimeout(() => setSuccess(false), 3000)
  }

  const openDoc = doc => {
    if (isElectron && doc.chemin_fichier) {
      window.api.documentsOpen(doc.chemin_fichier)
    }
  }

  const exportDoc = async doc => {
    if (!isElectron || !doc.chemin_fichier) return

    try {
      const exportedPath = await window.api.documentsExport(doc.chemin_fichier)
      if (exportedPath) {
        clearNoticeLater(`Document exporte vers ${exportedPath.split(/[\\/]/).pop()}.`)
      }
    } catch (error) {
      clearNoticeLater(error.message || 'Impossible d exporter le document.')
    }
  }

  const filtered = useMemo(() => {
    return docs.filter(doc => {
      if (filter.type && doc.type !== filter.type) return false
      if (filter.fournisseur && doc.fournisseur_nom !== filter.fournisseur) return false

      if (filter.search) {
        const query = filter.search.toLowerCase()
        if (!doc.reference?.toLowerCase().includes(query) && !doc.fournisseur_nom?.toLowerCase().includes(query)) {
          return false
        }
      }

      return true
    })
  }, [docs, filter])

  const totalFactures = docs
    .filter(doc => doc.type === 'FACTURE' && doc.montant)
    .reduce((sum, doc) => sum + doc.montant, 0)

  const nbBL = docs.filter(doc => doc.type === 'BL').length
  const nbFactures = docs.filter(doc => doc.type === 'FACTURE').length
  const nbCommandes = docs.filter(doc => doc.type === 'COMMANDE').length
  const previewKind = getFileKind(previewDoc?.chemin_fichier)

  return (
    <div className="space-y-6 w-full min-w-0">
      {success && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-3 text-amber-300 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Document archive avec succes.
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/30 rounded-xl px-5 py-3 text-sky-300 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          value={nbBL}
          label="Bons de livraison"
          color="bg-sky-500/15"
          icon={<svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <KpiCard
          value={nbFactures}
          label="Factures"
          color="bg-amber-500/15"
          icon={<svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <KpiCard
          value={nbCommandes}
          label="Bons de commande"
          color="bg-emerald-500/15"
          icon={<svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <KpiCard
          value={formatMoney(totalFactures)}
          label="Total factures HT"
          color="bg-green-500/15"
          icon={<svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-w-0">
          <input
            type="text"
            placeholder="Rechercher par reference ou fournisseur..."
            value={filter.search}
            onChange={e => setFilter(current => ({ ...current, search: e.target.value }))}
            className="md:col-span-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
          />
          <select
            value={filter.type}
            onChange={e => setFilter(current => ({ ...current, type: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Tous types</option>
            <option value="BL">Bons de livraison</option>
            <option value="FACTURE">Factures</option>
            <option value="COMMANDE">Bons de commande</option>
          </select>
          <select
            value={filter.fournisseur}
            onChange={e => setFilter(current => ({ ...current, fournisseur: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Tous fournisseurs</option>
            {fournisseurs.map(fournisseur => (
              <option key={fournisseur.id} value={fournisseur.nom}>
                {fournisseur.nom}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Archiver un document
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <h3 className="font-semibold text-white">Archiver un document</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={e => setForm(current => ({ ...current, type: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="FACTURE">Facture</option>
                <option value="BL">Bon de livraison</option>
                <option value="COMMANDE">Bon de commande</option>
              </select>
            </div>

            <div className="xl:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(current => ({ ...current, date: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Reference</label>
              <input
                type="text"
                value={form.reference}
                onChange={e => setForm(current => ({ ...current, reference: e.target.value }))}
                placeholder="FAC-2026-001"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="xl:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1">Fournisseur</label>
              <select
                value={form.fournisseur_id}
                onChange={e => setForm(current => ({ ...current, fournisseur_id: Number(e.target.value) }))}
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
              <label className="block text-xs font-medium text-slate-400 mb-1">Montant HT (EUR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.montant}
                onChange={e => setForm(current => ({ ...current, montant: e.target.value }))}
                placeholder="0.00"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-8">
              <label className="block text-xs font-medium text-slate-400 mb-1">Fichier (PDF / image)</label>
              <button
                onClick={pickFile}
                className="w-full bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-lg px-3 py-2 text-sm text-slate-300 text-left truncate transition-colors"
              >
                {form.chemin_fichier ? form.chemin_fichier.split(/[\\/]/).pop() : 'Attacher un fichier...'}
              </button>
            </div>

            <div className="md:col-span-2 xl:col-span-4">
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(current => ({ ...current, notes: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowForm(false)
                setForm(EMPTY_FORM)
              }}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>

            <button
              onClick={save}
              disabled={saving || !form.type || !form.date}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Archivage...' : 'Archiver'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden min-w-0">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Archives ({filtered.length})</h3>
        </div>

        <div className="divide-y divide-slate-700/50">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">Aucun document trouve</div>
          ) : (
            filtered.map(doc => (
              <div
                key={doc.id}
                className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto] gap-4 px-5 py-3.5 hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TYPE_COLORS[doc.type]}`}>
                        {TYPE_LABELS[doc.type] || doc.type}
                      </span>
                      {doc.reference && (
                        <span className="text-sm font-medium text-white truncate" title={doc.reference}>
                          {doc.reference}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {doc.fournisseur_nom || 'Fournisseur inconnu'} - {new Date(doc.date).toLocaleDateString('fr-FR')}
                      {doc.notes && ` - ${doc.notes}`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 2xl:justify-end">
                  {doc.montant ? (
                    <span className="text-sm font-semibold text-white whitespace-nowrap tabular-nums">
                      {formatMoney(doc.montant)}
                    </span>
                  ) : null}

                  {doc.chemin_fichier ? (
                    <>
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Previsualiser
                      </button>
                      <button
                        onClick={() => exportDoc(doc)}
                        className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Exporter
                      </button>
                      <button
                        onClick={() => openDoc(doc)}
                        className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Ouvrir
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-600 whitespace-nowrap">Pas de fichier</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm p-4 md:p-8">
          <div className="w-full h-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {previewDoc.reference || TYPE_LABELS[previewDoc.type] || 'Document'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {previewDoc.fournisseur_nom || 'Fournisseur inconnu'}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => exportDoc(previewDoc)}
                  className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-2 rounded-lg transition-colors"
                >
                  Exporter
                </button>
                <button
                  onClick={() => openDoc(previewDoc)}
                  className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-2 rounded-lg transition-colors"
                >
                  Ouvrir
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
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
                <iframe title={previewDoc.reference || 'Preview'} src={previewDataUrl} className="w-full h-full bg-white" />
              ) : previewKind === 'image' && previewDataUrl ? (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-6">
                  <img src={previewDataUrl} alt={previewDoc.reference || 'Document'} className="max-w-full max-h-full rounded-xl shadow-2xl" />
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
    </div>
  )
}
