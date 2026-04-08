# DentaStock

Application de gestion de stock pour cabinet dentaire, multi-postes en reseau local (serveur/client).

**[Telecharger l'installateur Windows (v2.5.1)](https://github.com/Khatoonn/DentaStock/releases/tag/v2.5.1)**

## Fonctionnalites

- **Tableau de bord** — Vue d'ensemble avec KPIs, alertes stock, alertes peremption (produits + lots), commandes en cours, depenses mensuelles, sante du systeme
- **Profils et operateurs** — Gestion des utilisateurs avec roles (Admin, Equipe, Lecture seule), permissions granulaires et authentification par code PIN
- **Journal d'audit** — Tracabilite complete de toutes les actions effectuees dans l'application
- **Commandes & Receptions** — Cycle complet : creation, commande automatique, reception partielle/totale, tracabilite des lots, alerte reception incomplete, conseiller de commande
- **Export PDF bon de commande** — Generation de bons de commande professionnels en PDF
- **Produits & Stock** — Catalogue avec categories, code-barres EAN, peremption, seuils intelligents, historique des prix, pagination
- **Inventaire physique** — Comparaison stock theorique vs reel avec ajustements en lot
- **Retours fournisseur** — Enregistrement des retours avec deduction automatique du stock
- **Consommation** — Saisie par soin et praticien, autocompletion (nom, reference, code-barres), templates
- **Fournisseurs** — Gestion avec coordonnees, remises par palier de quantite
- **Praticiens** — Gestion avec archivage/restauration
- **Statistiques** — Graphiques interactifs : depenses, top produits, repartition par categorie, alertes peremption
- **Documents / GED** — Archivage structure des BL et factures, preview integre, export
- **Export CSV** — Export de toutes les donnees compatible Excel
- **Recherche globale** — Ctrl+K pour trouver produits, fournisseurs, commandes depuis n'importe quel ecran
- **Notifications Windows** — Alertes automatiques au demarrage (stock bas, peremptions proches)
- **Theme clair / sombre** — Basculer via le bouton dans le header
- **Raccourcis clavier** — Alt+1-9 pour naviguer, Ctrl+K recherche, Ctrl+N nouveau produit
- **Seuils intelligents** — Analyse de consommation pour recommander les seuils optimaux
- **Prix HT/TTC** — Affichage des prix avec TVA, remises fournisseur automatiques
- **Mise a jour automatique** — Notification et installation des nouvelles versions via GitHub Releases
- **Chargement a la demande** — Pages chargees dynamiquement (lazy loading) pour un demarrage plus rapide

### Architecture serveur/client

- **Mode Serveur** — Le poste principal stocke la base de donnees localement. Le dossier est partage sur le reseau Windows.
- **Mode Client** — Les postes secondaires se connectent au dossier partage. Replique locale synchronisee automatiquement.

### Securite et acces

- Profils operateur avec 3 niveaux de role : Administrateur, Equipe, Lecture seule
- 10 permissions granulaires (commandes, stock, fournisseurs, praticiens, parametres...)
- Authentification par code PIN a 4 chiffres (hash SHA-256)
- Journal d'audit avec tracabilite de toutes les actions

### Sauvegardes automatiques

- Sauvegarde hebdomadaire roulante sur 8 semaines
- Sauvegarde mensuelle compressee (.db.gz) sur 12 mois
- Point de restauration compresse automatique avant import et avant restauration
- Historique des sauvegardes consultable et restaurable depuis les Parametres
- Export/import complet de la base de donnees

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Desktop | Electron 29 |
| Frontend | React 18 + React Router 6 |
| Build | Vite 5 (code-split / lazy loading) |
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

Genere `dist/DentaStock-Setup-2.5.1.exe`

### Base de demonstration

Un generateur de donnees fictives est inclus pour les presentations :

```bash
python generate-demo-db.py
```

Genere une base avec 6 mois d'activite : 43 produits, 5 fournisseurs avec remises,
5 praticiens, 30 commandes, 1400+ actes de soins, historique des prix, alertes stock et peremption.

## Licence

Usage prive — Cabinet dentaire.
