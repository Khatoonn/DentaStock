import { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

const DEMO_STATUS = {
  mode: 'shared',
  storageRoot: 'E:\\Cabinet\\DentaStock',
  dbPath: 'E:\\Cabinet\\DentaStock\\database\\dentastock.db',
  dbDirectory: 'E:\\Cabinet\\DentaStock\\database',
  documentsPath: 'E:\\Cabinet\\DentaStock\\documents',
}

const PROFILE_ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Administrateur', hint: 'Acces complet au parametrage et aux modifications' },
  { value: 'EQUIPE', label: 'Equipe', hint: 'Saisie et gestion quotidienne du stock' },
  { value: 'LECTURE', label: 'Lecture seule', hint: 'Consultation sans modification' },
]

const PERMISSION_OPTIONS = [
  { key: 'commandes_generate', label: 'Generation commande', hint: 'Creer une commande automatique ou preparee' },
  { key: 'commandes_edit', label: 'Modification commande', hint: 'Modifier, annuler ou supprimer une commande' },
  { key: 'receptions_edit', label: 'Reception / retours', hint: 'Valider une reception ou un retour fournisseur' },
  { key: 'stock_edit', label: 'Modification stock', hint: 'Corriger un stock ou enregistrer une consommation' },
  { key: 'fournisseurs_edit', label: 'Modification fournisseur', hint: 'Creer ou modifier les fournisseurs et remises' },
  { key: 'produits_edit', label: 'Modification produit', hint: 'Creer, modifier ou archiver produits et categories' },
  { key: 'praticiens_edit', label: 'Modification praticien', hint: 'Creer ou modifier les praticiens' },
  { key: 'utilisateurs_edit', label: 'Gestion operateurs', hint: 'Creer les operateurs et definir les droits' },
  { key: 'parametres_edit', label: 'Parametres sensibles', hint: 'Changer le stockage et la configuration du poste' },
  { key: 'sauvegardes_edit', label: 'Sauvegarde / restauration', hint: 'Exporter, importer, restaurer et verifier les sauvegardes' },
]

function buildDefaultPermissions(role = 'EQUIPE') {
  if (role === 'ADMIN') {
    return Object.fromEntries(PERMISSION_OPTIONS.map(permission => [permission.key, true]))
  }
  if (role === 'LECTURE') {
    return Object.fromEntries(PERMISSION_OPTIONS.map(permission => [permission.key, false]))
  }
  return {
    commandes_generate: true,
    commandes_edit: true,
    receptions_edit: true,
    stock_edit: true,
    fournisseurs_edit: false,
    produits_edit: false,
    praticiens_edit: false,
    utilisateurs_edit: false,
    parametres_edit: false,
    sauvegardes_edit: false,
  }
}

function createEmptyProfileForm() {
  return {
    nom: '',
    prenom: '',
    reference_code: '',
    pin: '',
    statut: 'ACTIF',
    role: 'EQUIPE',
    permissions: buildDefaultPermissions('EQUIPE'),
  }
}

function PathBlock({ label, value }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 break-all">
        {value || 'Non configure'}
      </div>
    </div>
  )
}

export default function Parametres() {
  const [status, setStatus] = useState(null)
  const [setupConfig, setSetupConfig] = useState(null)
  const [backupInfo, setBackupInfo] = useState(null)
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState(true)
  const { toast, confirm } = useToast()
  const [saving, setSaving] = useState(false)
  const [runningAutoBackup, setRunningAutoBackup] = useState(false)
  const [verifyingBackup, setVerifyingBackup] = useState('')
  const [profiles, setProfiles] = useState([])
  const [currentSession, setCurrentSession] = useState(null)
  const [profileForm, setProfileForm] = useState(createEmptyProfileForm)
  const [editingProfileId, setEditingProfileId] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const load = async () => {
    setLoading(true)

    if (isElectron) {
      try {
        const [nextStatus, nextSetup, nextBackup, nextProfiles, nextSession] = await Promise.all([
          window.api.storageGetStatus(),
          window.api.setupGetConfig(),
          window.api.backupStatus(),
          window.api.profilesList ? window.api.profilesList() : Promise.resolve([]),
          window.api.authGetSession ? window.api.authGetSession() : Promise.resolve(null),
        ])
        setStatus(nextStatus)
        setSetupConfig(nextSetup)
        setBackupInfo(nextBackup)
        setFolderPath(nextStatus.storageRoot || '')
        setProfiles(nextProfiles || [])
        setCurrentSession(nextSession || null)
      } catch (err) {
        toast(err.message || 'Impossible de charger la configuration de stockage.', 'error')
      } finally {
        setLoading(false)
      }
      return
    }

    setStatus(DEMO_STATUS)
    setFolderPath(DEMO_STATUS.storageRoot)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const refresh = () => void load()
    window.addEventListener('dentastock-session-changed', refresh)

    return () => {
      window.removeEventListener('dentastock-session-changed', refresh)
    }
  }, [])

  const pickDirectory = async () => {
    if (!isElectron) return

    const pickedPath = await window.api.dialogOpenDirectory()
    if (pickedPath) {
      setFolderPath(pickedPath)

    }
  }

  const saveStorage = async () => {
    if (!folderPath.trim()) {
      toast('Veuillez renseigner un dossier cible.', 'error')
      return
    }

    setSaving(true)



    try {
      const nextStatus = await window.api.storageSetRoot(folderPath.trim())
      setStatus(nextStatus)
      setFolderPath(nextStatus.storageRoot || folderPath.trim())

      if (nextStatus.databaseState === 'existing') {
        toast('Le dossier partage a ete applique et la base existante a ete ouverte.')
      } else {
        toast('Le dossier partage a ete applique et la base courante a ete copiee.')
      }
    } catch (err) {
      toast(err.message || 'Impossible d appliquer ce dossier partage.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Chargement de la configuration...
      </div>
    )
  }

  const sharedMode = status?.mode === 'shared'
  const canManageOperators = Boolean(currentSession?.operator?.permissions?.utilisateurs_edit)

  const resetProfileForm = () => {
    setProfileForm(createEmptyProfileForm())
    setEditingProfileId(null)
  }

  const runAutoBackupNow = async () => {
    if (!isElectron) return
    setRunningAutoBackup(true)
    try {
      await window.api.backupRunAutoNow()
      toast('Sauvegarde automatique lancee.', 'success')
      await load()
    } catch (err) {
      toast(err.message || 'Impossible de lancer la sauvegarde automatique.', 'error')
    } finally {
      setRunningAutoBackup(false)
    }
  }

  const verifyBackup = async (backupName = '') => {
    if (!isElectron) return
    setVerifyingBackup(backupName || '__latest__')
    try {
      const result = await window.api.backupVerifyIntegrity(backupName || null)
      if (result?.ok) {
        toast(`Integrite OK sur ${result.backupName}.`, 'success')
      } else {
        toast(`Probleme detecte sur ${result?.backupName || 'la sauvegarde'}.`, 'error')
      }
      await load()
    } catch (err) {
      toast(err.message || 'Impossible de verifier la sauvegarde.', 'error')
    } finally {
      setVerifyingBackup('')
    }
  }

  const saveProfile = async () => {
    if (!isElectron) return
    if (!canManageOperators) {
      toast('Votre operateur ne dispose pas du droit de gestion des operateurs.', 'error')
      return
    }
    if (!profileForm.nom.trim()) {
      toast('Le nom de l operateur est obligatoire.', 'error')
      return
    }
    if (!profileForm.reference_code.trim()) {
      toast('Le numero de reference est obligatoire.', 'error')
      return
    }
    if (!editingProfileId && profileForm.pin.length !== 4) {
      toast('Le code PIN doit contenir exactement 4 chiffres.', 'error')
      return
    }

    setSavingProfile(true)
    try {
      if (editingProfileId) {
        await window.api.profilesUpdate(editingProfileId, {
          nom: profileForm.nom.trim(),
          prenom: profileForm.prenom.trim(),
          reference_code: profileForm.reference_code.trim(),
          pin: profileForm.pin,
          statut: profileForm.statut,
          role: profileForm.role,
          permissions: profileForm.permissions,
        })
        toast('Operateur mis a jour.', 'success')
      } else {
        await window.api.profilesAdd({
          nom: profileForm.nom.trim(),
          prenom: profileForm.prenom.trim(),
          reference_code: profileForm.reference_code.trim(),
          pin: profileForm.pin,
          statut: profileForm.statut,
          role: profileForm.role,
          permissions: profileForm.permissions,
        })
        toast('Operateur ajoute.', 'success')
      }
      resetProfileForm()
      await load()
      window.dispatchEvent(new Event('dentastock-session-changed'))
    } catch (err) {
      toast(err.message || 'Impossible d enregistrer l operateur.', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const editProfile = profile => {
    if (!canManageOperators) {
      toast('Votre operateur ne dispose pas du droit de gestion des operateurs.', 'error')
      return
    }
    setProfileForm({
      nom: profile.nom || '',
      prenom: profile.prenom || '',
      reference_code: profile.reference_code || '',
      pin: '',
      statut: profile.statut || 'ACTIF',
      role: profile.role || 'EQUIPE',
      permissions: profile.permissions || buildDefaultPermissions(profile.role || 'EQUIPE'),
    })
    setEditingProfileId(profile.id)
  }

  const deleteProfile = async profile => {
    if (!canManageOperators) {
      toast('Votre operateur ne dispose pas du droit de gestion des operateurs.', 'error')
      return
    }
    if (!(await confirm(`Supprimer l operateur "${profile.nom_complet || profile.nom}" ?`))) return
    try {
      await window.api.profilesDelete(profile.id)
      if (editingProfileId === profile.id) {
        resetProfileForm()
      }
      await load()
      window.dispatchEvent(new Event('dentastock-session-changed'))
      toast('Operateur supprime.', 'success')
    } catch (err) {
      toast(err.message || 'Impossible de supprimer l operateur.', 'error')
    }
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* Mode serveur/client */}
      {setupConfig && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${setupConfig.mode === 'server' ? 'bg-sky-500/15' : 'bg-emerald-500/15'}`}>
                <svg className={`w-6 h-6 ${setupConfig.mode === 'server' ? 'text-sky-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {setupConfig.mode === 'server'
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  }
                </svg>
              </div>
              <div>
                <div className="text-lg font-semibold text-white">
                  Mode {setupConfig.mode === 'server' ? 'Serveur' : 'Client'}
                </div>
                <div className="text-sm text-slate-400 mt-0.5">
                  {setupConfig.mode === 'server'
                    ? 'Ce poste stocke la base de donnees. Partagez le dossier data pour les autres postes.'
                    : `Connecte a : ${setupConfig.dataPath}`
                  }
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Base : {setupConfig.dataPath}
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (await confirm('Reinitialiser la configuration serveur/client ? L application redemarrera avec l ecran de configuration.')) {
                  await window.api.setupReset()
                  window.location.reload()
                }
              }}
              className="text-xs text-slate-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Reconfigurer
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Mode actif</div>
          <div className="flex items-center justify-between mt-3">
            <div>
              <div className="text-2xl font-bold text-white">
                {sharedMode ? 'Partage reseau' : 'Stockage local'}
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Les fichiers joints sont copies automatiquement dans l archive DentaStock.
              </div>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sharedMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700 text-slate-300'}`}>
              {sharedMode ? 'Partage' : 'Local'}
            </span>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Base de donnees</div>
          <div className="text-2xl font-bold text-white mt-3">SQLite centralisee</div>
          <div className="text-sm text-slate-400 mt-1">
            Le fichier actif est celui charge par Electron pour les ecritures du stock.
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Les ecritures sont rechargees depuis le disque avant validation pour mieux tenir un usage reseau local.
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Archive documents</div>
          <div className="text-2xl font-bold text-white mt-3">BL et factures</div>
          <div className="text-sm text-slate-400 mt-1">
            Chaque piece jointe est recopied dans un dossier date, puis memorisee dans la GED.
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Structure creee automatiquement: <span className="font-mono">database</span> et <span className="font-mono">documents</span>.
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Configurer le dossier partage</h3>
          <p className="text-sm text-slate-400 mt-1">
            Choisissez un dossier commun du cabinet, par exemple un partage reseau. DentaStock y placera la base et les archives.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3">
          <input
            type="text"
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            placeholder="\\\\SERVEUR\\Commun\\DentaStock"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
          />
          <button
            onClick={pickDirectory}
            className="bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Choisir...
          </button>
          <button
            onClick={saveStorage}
            disabled={!isElectron || saving}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Application...' : 'Appliquer'}
          </button>
        </div>

        {!isElectron && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Mode navigateur: cette page montre seulement une maquette. Le parametrage fonctionne dans Electron.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PathBlock label="Dossier partage actif" value={status?.storageRoot || 'Aucun dossier partage configure'} />
          <PathBlock label="Dossier archives documents" value={status?.documentsPath} />
          <PathBlock label="Fichier base de donnees" value={status?.dbPath} />
          <PathBlock label="Dossier base de donnees" value={status?.dbDirectory} />
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Sauvegarde et restauration</h3>
          <p className="text-sm text-slate-400 mt-1">
            Exportez votre base de donnees pour en faire une sauvegarde, ou importez une sauvegarde existante.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white">Exporter la base</div>
                <div className="text-xs text-slate-400">Sauvegarder dans un fichier .db</div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!isElectron) return


                try {
                  const path = await window.api.dbExport()
                  if (path) toast(`Base exportee vers : ${path}`)
                } catch (err) {
                  toast(err.message, 'error')
                }
              }}
              disabled={!isElectron}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Exporter...
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-white">Importer une base</div>
                <div className="text-xs text-slate-400">Remplace la base actuelle (sauvegarde auto)</div>
              </div>
            </div>
            <button
              onClick={async () => {
                if (!isElectron) return


                try {
                  const result = await window.api.dbImport()
                  if (result) {
                    toast(`Base importee depuis : ${result.imported}. Sauvegarde de l'ancienne : ${result.backup}`)
                    load()
                  }
                } catch (err) {
                  toast(err.message, 'error')
                }
              }}
              disabled={!isElectron}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
            >
              Importer...
            </button>
          </div>
        </div>
      </div>

      {/* Sauvegardes automatiques & Replication */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Sauvegardes automatiques</h3>
            <p className="text-sm text-slate-400 mt-1">
              Sauvegarde hebdomadaire roulante sur 8 semaines, mensuelle compressee sur 12 mois, et point de restauration auto avant import ou restauration.
            </p>
          </div>
          <button
            onClick={async () => {
              if (!isElectron) return
              void 0; void 0
              try {
                const p = await window.api.backupRunNow()
                toast(`Sauvegarde manuelle creee : ${p}`)
                load()
              } catch (err) { toast(err.message, 'error') }
            }}
            disabled={!isElectron}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            Sauvegarder maintenant
          </button>
        </div>

        {backupInfo && (
          <>
            {backupInfo.autoBackupOverdue && (
              <div className={`rounded-xl border px-4 py-4 ${backupInfo.autoBackupWarningLevel === 'red' ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${backupInfo.autoBackupWarningLevel === 'red' ? 'text-red-200' : 'text-amber-200'}`}>
                      Sauvegarde automatique en retard
                    </div>
                    <div className={`text-sm mt-1 ${backupInfo.autoBackupWarningLevel === 'red' ? 'text-red-100' : 'text-amber-100'}`}>
                      La derniere sauvegarde auto date de {backupInfo.autoBackupDelayDays ?? '?'} jour{backupInfo.autoBackupDelayDays > 1 ? 's' : ''}.
                    </div>
                  </div>
                  <button
                    onClick={runAutoBackupNow}
                    disabled={!isElectron || runningAutoBackup}
                    className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${backupInfo.autoBackupWarningLevel === 'red' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-amber-600 hover:bg-amber-500 text-white'} disabled:opacity-50`}
                  >
                    {runningAutoBackup ? 'Sauvegarde...' : 'Sauvegarder maintenant'}
                  </button>
                </div>
              </div>
            )}
            <div className="text-xs text-slate-500">
              Les donnees metier ne sont plus purgees automatiquement. Les sauvegardes anciennes sont simplement retirees au fil de l eau.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Derniere sauvegarde hebdo</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastWeeklyBackup
                    ? new Date(backupInfo.lastWeeklyBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Aucune'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Derniere sauvegarde mensuelle</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastMonthlyBackup
                    ? new Date(backupInfo.lastMonthlyBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Aucune'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sauvegardes conservees</div>
                <div className="text-sm font-medium text-white mt-2">{backupInfo.backups.length} fichier{backupInfo.backups.length > 1 ? 's' : ''}</div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Dossier</div>
                <div className="text-xs text-slate-300 mt-2 break-all">{backupInfo.backupDir}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Dernier controle d integrite</div>
                <div className="text-sm font-medium text-white mt-2">
                  {backupInfo.lastIntegrityCheck
                    ? (backupInfo.lastIntegrityCheck.ok ? 'Integrite OK' : 'Probleme detecte')
                    : 'Aucun controle lance'
                  }
                </div>
                <div className="text-xs text-slate-400 mt-2 break-all">
                  {backupInfo.lastIntegrityCheck
                    ? `${new Date(backupInfo.lastIntegrityCheck.checkedAt).toLocaleString('fr-FR')} - ${backupInfo.lastIntegrityCheck.backupName}`
                    : 'Utilisez le bouton ci-dessous pour verifier une sauvegarde sans la restaurer.'
                  }
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Test de restauration</div>
                  <div className="text-sm text-slate-300 mt-2">
                    Controle la sauvegarde la plus recente avec <span className="font-mono">PRAGMA integrity_check</span>, sans toucher a la base active.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => verifyBackup()}
                    disabled={!isElectron || verifyingBackup !== ''}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {verifyingBackup === '__latest__' ? 'Verification...' : 'Verifier la plus recente'}
                  </button>
                  <button
                    onClick={runAutoBackupNow}
                    disabled={!isElectron || runningAutoBackup}
                    className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {runningAutoBackup ? 'Sauvegarde...' : 'Lancer une sauvegarde auto'}
                  </button>
                </div>
              </div>
            </div>

            {backupInfo.backups.length > 0 && (
              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 text-xs font-medium text-slate-400">
                  Historique des sauvegardes
                </div>
                <div className="divide-y divide-slate-700/50 max-h-48 overflow-y-auto">
                  {backupInfo.backups.map(b => (
                    <div key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-700/30">
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{b.name}</div>
                        <div className="text-xs text-slate-500">{new Date(b.date).toLocaleDateString('fr-FR')} - {(b.size / 1024).toFixed(0)} Ko</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!(await confirm(`Restaurer la sauvegarde "${b.name}" ? La base actuelle sera sauvegardee avant.`))) return
          
                          try {
                            const r = await window.api.backupRestore(b.name)
                            toast(`Base restauree depuis ${r.restored}. Ancienne sauvegardee dans ${r.backup}`)
                            load()
                          } catch (err) { toast(err.message, 'error') }
                        }}
                        className="text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1 rounded-lg shrink-0"
                      >
                        Restaurer
                      </button>
                      <button
                        onClick={() => verifyBackup(b.name)}
                        disabled={!isElectron || verifyingBackup !== ''}
                        className="text-xs text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 px-3 py-1 rounded-lg shrink-0"
                      >
                        {verifyingBackup === b.name ? 'Verification...' : 'Verifier'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Replica info (client only) */}
            {backupInfo.replica && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-white">Replica locale</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Copie de secours synchronisee toutes les 5 min depuis le serveur
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {backupInfo.serverReachable !== null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${backupInfo.serverReachable ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                        {backupInfo.serverReachable ? 'Serveur connecte' : 'Serveur injoignable'}
                      </span>
                    )}
                    <button
                      onClick={async () => {
        
                        try {
                          const r = await window.api.replicaSyncNow()
                          if (r.success) toast('Replica synchronisee.')
                          else toast('Impossible de synchroniser (serveur inaccessible).', 'error')
                          load()
                        } catch (err) { toast(err.message, 'error') }
                      }}
                      className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 px-3 py-1 rounded-lg"
                    >
                      Synchro manuelle
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Derniere synchro : </span>
                    <span className="text-slate-300">
                      {backupInfo.replica.lastSync
                        ? new Date(backupInfo.replica.lastSync).toLocaleString('fr-FR')
                        : 'Jamais'
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Taille replica : </span>
                    <span className="text-slate-300">
                      {backupInfo.replica.size ? `${(backupInfo.replica.size / 1024).toFixed(0)} Ko` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Operateurs et droits</h3>
            <p className="text-sm text-slate-400 mt-1">
              Chaque operateur a son numero de reference, son code PIN, son statut et ses droits. L operateur connecte apparait en haut de l application pour la tracabilite.
            </p>
            {!canManageOperators && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Votre session peut consulter les operateurs, mais seule une session avec le droit <span className="font-medium">Gestion operateurs</span> peut les modifier.
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
            Operateur connecte :
            <span className="text-white font-medium ml-2">
              {currentSession?.operator?.nom_complet || 'Aucun'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_420px] gap-5">
          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 text-xs font-medium text-slate-400 uppercase tracking-wide">
              Operateurs du cabinet
            </div>
            <div className="divide-y divide-slate-700/50">
              {profiles.length === 0 ? (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">Aucun operateur configure.</div>
              ) : (
                profiles.map(profile => (
                  <div key={profile.id} className="px-4 py-4 flex flex-col gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-white">{profile.nom_complet || profile.nom}</div>
                        {Number(profile.id) === Number(currentSession?.operator?.id || 0) && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase bg-emerald-500/15 text-emerald-300">
                            Connecte
                          </span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          profile.statut === 'ACTIF' ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'
                        }`}>
                          {profile.statut}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                          profile.role === 'ADMIN'
                            ? 'bg-sky-500/15 text-sky-300'
                            : profile.role === 'LECTURE'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-700 text-slate-300'
                        }`}>
                          {PROFILE_ROLE_OPTIONS.find(option => option.value === profile.role)?.label || profile.role}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Ref. {profile.reference_code} - {PROFILE_ROLE_OPTIONS.find(option => option.value === profile.role)?.hint || 'Operateur standard'}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                        {PERMISSION_OPTIONS.map(permission => (
                          <div key={permission.key} className={`text-[11px] rounded-lg px-2.5 py-2 border ${
                            profile.permissions?.[permission.key]
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              : 'border-slate-700 bg-slate-900/60 text-slate-500'
                          }`}>
                            {permission.label}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => editProfile(profile)}
                        disabled={!canManageOperators}
                        className="text-xs text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => void deleteProfile(profile)}
                        disabled={!canManageOperators}
                        className="text-xs text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-4">
            <div>
              <div className="text-sm font-medium text-white">
                {editingProfileId ? 'Modifier un operateur' : 'Ajouter un operateur'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                La connexion se fait ensuite avec le numero de reference et le code PIN a 4 chiffres.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nom *</label>
                <input
                  type="text"
                  value={profileForm.nom}
                  onChange={e => setProfileForm(current => ({ ...current, nom: e.target.value }))}
                  disabled={!canManageOperators}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Ex: Martin"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Prenom</label>
                <input
                  type="text"
                  value={profileForm.prenom}
                  onChange={e => setProfileForm(current => ({ ...current, prenom: e.target.value }))}
                  disabled={!canManageOperators}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Ex: Claire"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Numero de ref *</label>
                <input
                  type="text"
                  value={profileForm.reference_code}
                  onChange={e => setProfileForm(current => ({ ...current, reference_code: e.target.value.replace(/\D/g, '') }))}
                  disabled={!canManageOperators}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Ex: 1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Code PIN {editingProfileId ? '(laisser vide pour garder)' : '*'}</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={profileForm.pin}
                  onChange={e => setProfileForm(current => ({ ...current, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  disabled={!canManageOperators}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="0000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Statut</label>
                <select
                  value={profileForm.statut}
                  onChange={e => setProfileForm(current => ({ ...current, statut: e.target.value }))}
                  disabled={!canManageOperators}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="ACTIF">Actif</option>
                  <option value="INACTIF">Inactif</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <select
                value={profileForm.role}
                onChange={e => {
                  const nextRole = e.target.value
                  setProfileForm(current => ({
                    ...current,
                    role: nextRole,
                    permissions: buildDefaultPermissions(nextRole),
                  }))
                }}
                disabled={!canManageOperators}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {PROFILE_ROLE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <div className="text-xs text-slate-500 mt-2">
                {PROFILE_ROLE_OPTIONS.find(option => option.value === profileForm.role)?.hint}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-400 mb-3">Droits operateur</div>
              <div className="space-y-2">
                {PERMISSION_OPTIONS.map(permission => (
                  <label key={permission.key} className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(profileForm.permissions?.[permission.key])}
                      onChange={e => setProfileForm(current => ({
                        ...current,
                        permissions: {
                          ...current.permissions,
                          [permission.key]: e.target.checked,
                        },
                      }))}
                      disabled={!canManageOperators}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm text-white">{permission.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{permission.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={resetProfileForm}
                disabled={!canManageOperators}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveProfile}
                disabled={!canManageOperators || savingProfile || !profileForm.nom.trim() || !profileForm.reference_code.trim() || (!editingProfileId && profileForm.pin.length !== 4)}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                {savingProfile ? 'Enregistrement...' : editingProfileId ? 'Mettre a jour' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white">Ce que cette version gere</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Receptions</div>
            <div className="text-sm text-slate-400 mt-2">
              Le document joint d une reception est copie dans l archive et un bon de livraison GED est cree automatiquement.
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Documents</div>
            <div className="text-sm text-slate-400 mt-2">
              L import manuel dans la GED stocke des copies propres, sans dependre du chemin source d origine.
            </div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="text-sm font-medium text-white">Postes du cabinet</div>
            <div className="text-sm text-slate-400 mt-2">
              Chaque poste peut pointer vers le meme dossier reseau pour partager la base et les pieces archivees.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
