# DentaStock

Application de gestion de stock pour cabinet dentaire, multi-postes en reseau local (serveur/client).

**[Telecharger l'installateur Windows (v2.0.1)](https://github.com/Khatoonn/DentaStock/releases/tag/v2.0.1)**

## Fonctionnalites

- **Tableau de bord** — Vue d'ensemble : alertes stock, commandes en cours, receptions recentes, KPI mensuels
- **Commandes & Receptions** — Cycle complet : creation de commande, reception partielle ou totale, suivi multi-passages, archivage automatique des BL/factures
- **Produits & Stock** — Page unifiee : catalogue produits, gestion du stock, fiche detail avec historique d'achat, archivage/suppression
- **Consommation** — Saisie des produits utilises par soin, avec recherche par autocompletion et templates par type de soin
- **Fournisseurs** — Gestion avec coordonnees et contact, liste compacte avec detail au clic, archivage/restauration
- **Praticiens** — Gestion des praticiens avec archivage/restauration
- **Documents / GED** — Archivage structure des BL et factures (par type/annee/mois), preview integre, export
- **Parametres** — Configuration serveur/client, sauvegardes automatiques, replication
- **Theme clair / sombre** — Basculer entre mode clair et mode sombre via le bouton dans le header

### Architecture serveur/client

- **Mode Serveur** — Le poste principal stocke la base de donnees localement (`C:\DentaStock\data\`). Le dossier est partage sur le reseau Windows pour les autres postes.
- **Mode Client** — Les postes secondaires se connectent au dossier partage du serveur. Une replique locale est synchronisee toutes les 5 minutes. Si le serveur est inaccessible, le client bascule automatiquement sur sa replique.

### Sauvegardes automatiques

- Sauvegarde mensuelle compressée (.db.gz)
- Nettoyage automatique des donnees de plus d'un an (utilisations, receptions, commandes)
- Historique des sauvegardes consultable et restaurable depuis les Parametres

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Desktop | Electron 29 |
| Frontend | React 18 + React Router 6 |
| Build | Vite 5 |
| Styles | Tailwind CSS 3 |
| Base de donnees | SQLite via sql.js (pur JS, aucune compilation native) |
| Packaging | electron-builder (NSIS) |

## Installation

### Mode developpement

```bash
npm install
npm run dev
```

Cela lance Vite (port 5173) et Electron simultanement.

### Build de l'installateur Windows

```bash
npm run pack
```

Genere `dist/DentaStock Setup 1.0.0.exe` — installateur NSIS avec :
- Demande d'elevation administrateur (UAC)
- Installation par defaut sur `C:\DentaStock`
- Choix du dossier d'installation
- Raccourcis Bureau et Menu Demarrer

## Structure du projet

```
electron/
  main.js        Backend Electron : base de donnees, IPC, replication, sauvegardes
  preload.js     Bridge securise entre main et renderer (contextIsolation)
src/
  App.jsx        Routeur principal (HashRouter) + flux setup
  components/
    Header.jsx   Barre de titre avec controles fenetre
    Sidebar.jsx  Navigation laterale
  pages/
    Dashboard.jsx
    Setup.jsx          Ecran de configuration initiale (serveur/client)
    Reception.jsx      Commandes + receptions fournisseur
    Consommation.jsx   Saisie des utilisations par soin
    Produits.jsx       Produits & Stock unifies + archivage
    Fournisseurs.jsx   Liste compacte + detail + archivage
    Praticiens.jsx     Gestion + archivage
    Documents.jsx      GED / archivage
    Parametres.jsx     Config, sauvegardes, replication
build/
  installer.nsh  Script NSIS personnalise (chemin d'install par defaut)
assets/
  icon.ico       Icone de l'application
```

## Base de donnees

SQLite stockee localement (serveur : `C:\DentaStock\data\`, client : replique dans `data/replica/`).

Tables principales : `produits`, `fournisseurs`, `praticiens`, `commandes`, `receptions`, `utilisations`, `documents`, `categories`, `config`

Securite concurrence : verrouillage fichier pour les ecritures, detection de modifications externes, transactions avec rollback.

## Licence

Usage prive — Cabinet dentaire.
