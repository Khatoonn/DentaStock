# DentaStock

Application de gestion de stock pour cabinet dentaire. Installable en local sur Windows, avec possibilite future de fonctionnement en reseau local (serveur/client).

## Fonctionnalites

- **Tableau de bord** - Vue d'ensemble : alertes stock, commandes en cours, receptions recentes, KPI mensuels
- **Commandes & Receptions** - Cycle complet : creation de commande, reception partielle ou totale, suivi multi-passages, archivage automatique des BL/factures
- **Gestion de stock** - Consultation et correction manuelle du stock, fiche produit detaillee avec historique d'achat
- **Consommation** - Saisie des produits utilises par soin, avec recherche produit par autocompletion et templates par type de soin
- **Catalogue produits** - CRUD complet avec categories, references, seuils d'alerte, prix unitaires, fournisseur associe
- **Fournisseurs** - Gestion des fournisseurs avec coordonnees et contact commercial
- **Praticiens** - Gestion des praticiens (ajout, modification, suppression)
- **Documents / GED** - Archivage structure des BL et factures (par type/annee/mois), preview integre, export
- **Parametres** - Configuration du stockage (local ou dossier reseau partage)

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

Genere `dist/DentaStock Setup 1.0.0.exe` - installateur NSIS avec :
- Demande d'elevation administrateur (UAC)
- Installation par defaut sur `C:\DentaStock`
- Choix du dossier d'installation
- Raccourcis Bureau et Menu Demarrer

## Structure du projet

```
electron/
  main.js        Backend Electron : base de donnees, IPC handlers, archivage documents
  preload.js     Bridge securise entre main et renderer (contextIsolation)
src/
  App.jsx        Routeur principal (HashRouter)
  components/
    Header.jsx   Barre de titre avec controles fenetre
    Sidebar.jsx  Navigation laterale
  pages/
    Dashboard.jsx
    Reception.jsx      Commandes + receptions fournisseur
    Stock.jsx          Gestion du stock + fiche produit
    Consommation.jsx   Saisie des utilisations par soin
    Produits.jsx       Catalogue produits
    Fournisseurs.jsx
    Praticiens.jsx
    Documents.jsx      GED / archivage
    Parametres.jsx     Configuration stockage
build/
  installer.nsh  Script NSIS personnalise (chemin d'install par defaut)
assets/
  icon.ico       Icone de l'application
```

## Base de donnees

SQLite stockee localement (par defaut dans `%APPDATA%/dentastock/data/`). Peut etre deplacee sur un dossier reseau partage via les Parametres.

Tables principales : `produits`, `fournisseurs`, `praticiens`, `commandes`, `receptions`, `utilisations`, `documents`, `categories`, `config`

Securite concurrence : verrouillage fichier pour les ecritures, detection de modifications externes, transactions avec rollback.

## Licence

Usage prive - Cabinet dentaire.
