const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Setup serveur/client
  setupGetConfig: () => ipcRenderer.invoke('setup:getConfig'),
  setupGetDefaults: () => ipcRenderer.invoke('setup:getDefaults'),
  setupConfigure: config => ipcRenderer.invoke('setup:configure', config),
  setupBrowseFolder: () => ipcRenderer.invoke('setup:browseFolder'),
  setupReset: () => ipcRenderer.invoke('setup:reset'),

  // Backup & Replica
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  backupRunNow: () => ipcRenderer.invoke('backup:runNow'),
  backupRunAutoNow: () => ipcRenderer.invoke('backup:runAutoNow'),
  backupRestore: name => ipcRenderer.invoke('backup:restore', name),
  backupVerifyIntegrity: name => ipcRenderer.invoke('backup:verifyIntegrity', name),
  replicaSyncNow: () => ipcRenderer.invoke('replica:syncNow'),
  serverGetStatus: () => ipcRenderer.invoke('server:getStatus'),
  serverRetryConnection: () => ipcRenderer.invoke('server:retryConnection'),

  // Config
  configGet: cle => ipcRenderer.invoke('config:get', cle),
  configSet: (cle, valeur) => ipcRenderer.invoke('config:set', cle, valeur),

  // Profils
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profilesGetActive: () => ipcRenderer.invoke('profiles:getActive'),
  profilesAdd: data => ipcRenderer.invoke('profiles:add', data),
  profilesUpdate: (id, data) => ipcRenderer.invoke('profiles:update', id, data),
  profilesDelete: id => ipcRenderer.invoke('profiles:delete', id),
  profilesSetActive: id => ipcRenderer.invoke('profiles:setActive', id),

  // Session operateur
  authListOperators: () => ipcRenderer.invoke('auth:listOperators'),
  authGetSession: () => ipcRenderer.invoke('auth:getSession'),
  authLogin: credentials => ipcRenderer.invoke('auth:login', credentials),
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  // Audit
  auditList: filters => ipcRenderer.invoke('audit:list', filters),

  // Stockage
  storageGetStatus: () => ipcRenderer.invoke('storage:getStatus'),
  storageSetRoot: rootPath => ipcRenderer.invoke('storage:setRoot', rootPath),

  // Fournisseurs
  fournisseursList: () => ipcRenderer.invoke('fournisseurs:list'),
  fournisseursListArchived: () => ipcRenderer.invoke('fournisseurs:listArchived'),
  fournisseursAdd: data => ipcRenderer.invoke('fournisseurs:add', data),
  fournisseursUpdate: (id, data) => ipcRenderer.invoke('fournisseurs:update', id, data),
  fournisseursArchive: id => ipcRenderer.invoke('fournisseurs:archive', id),
  fournisseursRestore: id => ipcRenderer.invoke('fournisseurs:restore', id),
  fournisseursDelete: id => ipcRenderer.invoke('fournisseurs:delete', id),

  // Categories
  categoriesList: () => ipcRenderer.invoke('categories:list'),
  categoriesAdd: data => ipcRenderer.invoke('categories:add', data),
  categoriesUpdate: (id, data) => ipcRenderer.invoke('categories:update', id, data),
  categoriesDelete: id => ipcRenderer.invoke('categories:delete', id),

  // Produits
  produitsList: () => ipcRenderer.invoke('produits:list'),
  produitsListArchived: () => ipcRenderer.invoke('produits:listArchived'),
  produitsAdd: data => ipcRenderer.invoke('produits:add', data),
  produitsUpdate: (id, data) => ipcRenderer.invoke('produits:update', id, data),
  produitsArchive: id => ipcRenderer.invoke('produits:archive', id),
  produitsRestore: id => ipcRenderer.invoke('produits:restore', id),
  produitsDelete: id => ipcRenderer.invoke('produits:delete', id),
  produitsHistory: id => ipcRenderer.invoke('produits:history', id),

  // Commandes
  commandesList: () => ipcRenderer.invoke('commandes:list'),
  commandesGet: id => ipcRenderer.invoke('commandes:get', id),
  commandesAdd: data => ipcRenderer.invoke('commandes:add', data),
  commandesUpdate: (id, data) => ipcRenderer.invoke('commandes:update', id, data),
  commandesUpdateStatus: (id, statut) => ipcRenderer.invoke('commandes:updateStatus', id, statut),
  commandesDelete: id => ipcRenderer.invoke('commandes:delete', id),
  commandesExportPdf: id => ipcRenderer.invoke('commandes:exportPdf', id),
  commandesAdvisor: () => ipcRenderer.invoke('commandes:advisor'),

  // Inventaire
  inventaireList: () => ipcRenderer.invoke('inventaire:list'),
  inventaireAdjust: (adjustments) => ipcRenderer.invoke('inventaire:adjust', adjustments),

  // Retours
  retoursList: () => ipcRenderer.invoke('retours:list'),
  retoursAdd: data => ipcRenderer.invoke('retours:add', data),

  // Praticiens
  praticiensList: () => ipcRenderer.invoke('praticiens:list'),
  praticiensListArchived: () => ipcRenderer.invoke('praticiens:listArchived'),
  praticiensAdd: data => ipcRenderer.invoke('praticiens:add', data),
  praticiensUpdate: (id, data) => ipcRenderer.invoke('praticiens:update', id, data),
  praticiensArchive: id => ipcRenderer.invoke('praticiens:archive', id),
  praticiensRestore: id => ipcRenderer.invoke('praticiens:restore', id),
  praticiensDelete: id => ipcRenderer.invoke('praticiens:delete', id),

  // Receptions
  receptionsList: () => ipcRenderer.invoke('receptions:list'),
  receptionsGet: id => ipcRenderer.invoke('receptions:get', id),
  receptionsAdd: data => ipcRenderer.invoke('receptions:add', data),
  receptionsUpdate: (id, data) => ipcRenderer.invoke('receptions:update', id, data),

  // Utilisations
  utilisationsList: () => ipcRenderer.invoke('utilisations:list'),
  utilisationsGet: id => ipcRenderer.invoke('utilisations:get', id),
  utilisationsAdd: data => ipcRenderer.invoke('utilisations:add', data),

  // Soins templates
  soinsTemplates: () => ipcRenderer.invoke('soins:templates'),
  soinsByType: type => ipcRenderer.invoke('soins:byType', type),

  // Documents
  documentsList: () => ipcRenderer.invoke('documents:list'),
  documentsAdd: data => ipcRenderer.invoke('documents:add', data),
  documentsOpen: filePath => ipcRenderer.invoke('documents:open', filePath),
  documentsExport: filePath => ipcRenderer.invoke('documents:export', filePath),
  documentsRead: filePath => ipcRenderer.invoke('documents:read', filePath),

  // Stats
  statsDashboard: () => ipcRenderer.invoke('stats:dashboard'),
  statsMonthly: () => ipcRenderer.invoke('stats:monthly'),
  statsTopProduits: () => ipcRenderer.invoke('stats:topProduits'),
  statsParCategorie: () => ipcRenderer.invoke('stats:parCategorie'),
  statsParFournisseur: () => ipcRenderer.invoke('stats:parFournisseur'),
  statsAlertesPeremption: () => ipcRenderer.invoke('stats:alertesPeremption'),
  statsValeurStock: () => ipcRenderer.invoke('stats:valeurStock'),

  // Commande automatique
  commandesAutoGenerate: () => ipcRenderer.invoke('commandes:autoGenerate'),

  // Export CSV
  exportCsv: type => ipcRenderer.invoke('export:csv', type),

  // Prix historique
  prixHistorique: produitId => ipcRenderer.invoke('prix:historique', produitId),

  // Recherche globale
  searchGlobal: query => ipcRenderer.invoke('search:global', query),

  // Seuils intelligents
  produitsSeuilRecommande: produitId => ipcRenderer.invoke('produits:seuilRecommande', produitId),

  // Remises fournisseurs
  remisesList: fournisseurId => ipcRenderer.invoke('remises:list', fournisseurId),
  remisesAdd: data => ipcRenderer.invoke('remises:add', data),
  remisesUpdate: (id, data) => ipcRenderer.invoke('remises:update', id, data),
  remisesDelete: id => ipcRenderer.invoke('remises:delete', id),

  // Calcul prix avec remise
  prixCalculer: params => ipcRenderer.invoke('prix:calculer', params),

  // Dialogs
  dialogOpenFile: filters => ipcRenderer.invoke('dialog:openFile', filters),
  dialogOpenDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // Base de donnees
  dbExport: () => ipcRenderer.invoke('db:export'),
  dbImport: () => ipcRenderer.invoke('db:import'),

  // Fenetre
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
})
