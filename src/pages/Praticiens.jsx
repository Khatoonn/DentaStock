import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const ROLES = [
  'chirurgien-dentiste',
  'orthodontiste',
  'endodontiste',
  'parodontiste',
  'assistant(e)',
  'hygieniste',
  'autre',
]

const EMPTY_FORM = { nom: '', prenom: '', role: 'chirurgien-dentiste' }

export default function Praticiens() {
  const [searchParams, setSearchParams] = useSearchParams()
  const preselectedPraticienId = Number(searchParams.get('praticien') || 0)
  const [praticiens, setPraticiens] = useState([])
  const [archivedPraticiens, setArchivedPraticiens] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const { toast, confirm } = useToast()
  const [tab, setTab] = useState('actifs')

  const load = async () => {
    if (!isElectron) return
    const [list, archived] = await Promise.all([
      window.api.praticiensList(),
      window.api.praticiensListArchived(),
    ])
    setPraticiens(list)
    setArchivedPraticiens(archived)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!preselectedPraticienId || praticiens.length === 0) return

    const praticien = praticiens.find(p => p.id === preselectedPraticienId)
    if (!praticien) return

    setTab('actifs')
    openEdit(praticien)

    setSearchParams(current => {
      const next = new URLSearchParams(current)
      next.delete('praticien')
      return next
    }, { replace: true })
  }, [preselectedPraticienId, praticiens, setSearchParams])

  const openNew = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (p) => {
    setForm({ nom: p.nom, prenom: p.prenom || '', role: p.role || 'chirurgien-dentiste' })
    setEditId(p.id)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.nom.trim()) return
    try {
      if (editId) {
        await window.api.praticiensUpdate(editId, form)
        toast('Praticien modifie.', 'success')
      } else {
        await window.api.praticiensAdd(form)
        toast('Praticien ajoute.', 'success')
      }
      setShowForm(false)
      setForm(EMPTY_FORM)
      setEditId(null)
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const archive = async (p) => {
    if (!(await confirm(`Archiver "${p.prenom ? `${p.prenom} ` : ''}${p.nom}" ?`))) return
    try {
      await window.api.praticiensArchive(p.id)
      toast(`"${p.nom}" archive.`, 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const restore = async (p) => {
    try {
      await window.api.praticiensRestore(p.id)
      toast(`"${p.nom}" restaure.`, 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const remove = async (p) => {
    if (!(await confirm(`Supprimer definitivement "${p.prenom ? `${p.prenom} ` : ''}${p.nom}" ? Cette action est irreversible.`))) return
    try {
      await window.api.praticiensDelete(p.id)
      toast(`"${p.nom}" supprime definitivement.`, 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const displayedList = tab === 'archives' ? archivedPraticiens : praticiens

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg bg-slate-900/60 p-0.5">
            <button
              onClick={() => setTab('actifs')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'actifs' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Actifs ({praticiens.length})
            </button>
            <button
              onClick={() => setTab('archives')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'archives' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Archives ({archivedPraticiens.length})
            </button>
          </div>
          <p className="text-sm text-slate-400">
            {tab === 'actifs'
              ? `${praticiens.length} praticien${praticiens.length > 1 ? 's' : ''}`
              : `${archivedPraticiens.length} archive${archivedPraticiens.length > 1 ? 's' : ''}`
            }
          </p>
        </div>
        {tab === 'actifs' && (
          <button
            onClick={openNew}
            className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un praticien
          </button>
        )}
      </div>

      {showForm && tab === 'actifs' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <h3 className="font-semibold text-white">{editId ? 'Modifier le praticien' : 'Nouveau praticien'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
              <input
                type="text"
                value={form.nom}
                onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Prenom</label>
              <input
                type="text"
                value={form.prenom}
                onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY_FORM) }}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={!form.nom.trim()}
              className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {editId ? 'Enregistrer' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="divide-y divide-slate-700/50">
          {displayedList.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              {tab === 'archives' ? 'Aucun praticien archive' : 'Aucun praticien enregistre'}
            </div>
          ) : (
            displayedList.map(p => (
              <div key={p.id} className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-700/30 transition-colors ${tab === 'archives' ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-9 h-9 rounded-lg ${tab === 'archives' ? 'bg-slate-700' : 'bg-teal-500/15'} flex items-center justify-center shrink-0`}>
                    <svg className={`w-4 h-4 ${tab === 'archives' ? 'text-slate-400' : 'text-teal-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-white text-sm">
                      Dr {p.prenom} {p.nom}
                    </div>
                    <div className="text-xs text-slate-400">
                      {p.role}
                      {tab === 'archives' && <span className="ml-2 text-slate-500">(archive)</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tab === 'actifs' ? (
                    <>
                      <button
                        onClick={() => openEdit(p)}
                        className="text-slate-400 hover:text-sky-400 transition-colors p-1"
                        title="Modifier"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => archive(p)}
                        className="text-slate-400 hover:text-amber-400 transition-colors p-1"
                        title="Archiver"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => restore(p)}
                        className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Restaurer
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="text-slate-400 hover:text-red-400 transition-colors p-1"
                        title="Supprimer definitivement"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
