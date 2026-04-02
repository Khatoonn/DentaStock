const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Setup serveur/client
  setupGetConfig: () => ipcRenderer.invoke('setup:getConfig'),
  setupConfigure: config => ipcRenderer.invoke('setup:configure', config),
  setupBrowseFolder: () => ipcRenderer.invoke('setup:browseFolder'),
  setupReset: () => ipcRenderer.invoke('setup:reset'),

  // Backup & Replica
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  backupRunNow: () => ipcRenderer.invoke('backup:runNow'),
  backupRestore: name => ipcRenderer.invoke('backup:restore', name),
  replicaSyncNow: () => ipcRenderer.invoke('replica:syncNow'),

  // Config
  configGet: cle => ipcRenderer.invoke('config:get', cle),
  configSet: (cle, valeur) => ipcRenderer.invoke('config:set', cle, valeur),

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
