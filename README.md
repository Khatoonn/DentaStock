# DentaStock

Application de gestion de stock pour cabinet dentaire, multi-postes en reseau local (serveur/client).

**[Telecharger l'installateur Windows (v2.1.0)](https://github.com/Khatoonn/DentaStock/releases/tag/v2.1.0)**

## Fonctionnalites

- **Tableau de bord** — Vue d'ensemble avec graphiques : alertes stock, commandes en cours, depenses mensuelles, KPIs
- **Commandes & Receptions** — Cycle complet : creation de commande, commande automatique, reception partielle ou totale, tracabilite des lots
- **Produits & Stock** — Catalogue complet avec categories, peremption, seuils intelligents, historique des prix, pagination
- **Consommation** — Saisie par soin et praticien, avec recherche par autocompletion et templates
- **Fournisseurs** — Gestion avec coordonnees, remises par palier de quantite
- **Praticiens** — Gestion des praticiens avec archivage/restauration
- **Statistiques** — Graphiques interactifs : depenses, top produits, repartition par categorie, alertes peremption
- **Documents / GED** — Archivage structure des BL et factures, preview integre, export
- **Export CSV** — Export de toutes les donnees (produits, commandes, consommations, fournisseurs) compatible Excel
- **Recherche globale** — Ctrl+K pour trouver produits, fournisseurs, commandes depuis n'importe quel ecran
- **Theme clair / sombre** — Basculer via le bouton dans le header
- **Notifications toast** — Confirmations visuelles non-intrusives pour toutes les actions
- **Raccourcis clavier** — Alt+1-9 pour naviguer, Ctrl+K recherche, Ctrl+N nouveau produit
- **Seuils intelligents** — Analyse de consommation pour recommander les seuils optimaux
- **Prix HT/TTC** — Affichage des prix avec TVA, remises fournisseur automatiques
- **Mise a jour automatique** — Notification et installation des nouvelles versions via GitHub Releases
- **Impression** — Impression des fiches produit avec mise en page optimisee

### Architecture serveur/client

- **Mode Serveur** — Le poste principal stocke la base de donnees localement. Le dossier est partage sur le reseau Windows.
- **Mode Client** — Les postes secondaires se connectent au dossier partage. Replique locale synchronisee automatiquement.

### Sauvegardes automatiques

- Sauvegarde mensuelle compressee (.db.gz)
- Historique des sauvegardes consultable et restaurable depuis les Parametres
- Export/import complet de la base de donnees

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Desktop | Electron 29 |
| Frontend | React 18 + React Router 6 |
| Build | Vite 5 |
| Styles | Tailwind CSS 3 |
| Base de donnees | SQLite via sql.js (WASM) |
| Graphiques | Recharts |
| Packaging | electron-builder (NSIS) |
| Auto-update | electron-updater |

## Installation

### Mode developpement

```bash
npm install
npm run dev
```

### Build de l'installateur Windows

```bash
npm run pack
```

Genere `dist/DentaStock Setup 2.1.0.exe`

## Licence

Usage prive — Cabinet dentaire.
