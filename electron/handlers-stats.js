// Stats, export, search and auto-generate handlers extracted from main.js
const fs = require('fs')

/**
 * Register all stats / export / search IPC handlers.
 *
 * @param {Object} ctx
 *   { safeHandle, dbAll, dbRun, dbGet, withWriteTransaction,
 *     getDb, dialog, app, getMainWindow }
 */
function register(ctx) {
  const { safeHandle, dbAll, dbRun, dbGet, withWriteTransaction, dialog, getMainWindow } = ctx

  // Dashboard
  safeHandle('stats:dashboard', () => {
    const totalProduits = dbGet('SELECT COUNT(*) AS c FROM produits').c
    const alertesStock = dbGet('SELECT COUNT(*) AS c FROM produits WHERE stock_actuel <= stock_minimum').c
    const commandesEnAttente = dbGet(`SELECT COUNT(*) AS c
      FROM commandes
      WHERE statut IN ('EN_ATTENTE', 'PARTIELLE')`).c
    const receptionsMois = dbGet(`SELECT COUNT(*) AS c
      FROM receptions
      WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`).c
    const montantRow = dbGet(`SELECT SUM(ri.quantite * ri.prix_unitaire) AS m
      FROM reception_items ri
      JOIN receptions r ON ri.reception_id = r.id
      WHERE strftime('%Y-%m', r.date) = strftime('%Y-%m', 'now')`)
    const montantMois = montantRow ? (montantRow.m || 0) : 0
    const produitsAlerte = dbAll(`SELECT *
      FROM produits
      WHERE stock_actuel <= stock_minimum
      ORDER BY (stock_actuel - stock_minimum)
      LIMIT 10`)
    const dernieresReceptions = dbAll(`SELECT r.*, f.nom AS fournisseur_nom
      FROM receptions r
      LEFT JOIN fournisseurs f ON r.fournisseur_id = f.id
      ORDER BY r.date DESC
      LIMIT 5`)
    const commandesEnCours = dbAll(`SELECT c.*, f.nom AS fournisseur_nom,
      (SELECT SUM(ci.quantite * ci.prix_unitaire) FROM commande_items ci WHERE ci.commande_id = c.id) AS montant_total
      FROM commandes c
      LEFT JOIN fournisseurs f ON c.fournisseur_id = f.id
      WHERE c.statut IN ('EN_ATTENTE', 'PARTIELLE')
      ORDER BY c.date_commande DESC
      LIMIT 5`)

    // Alertes péremption (produit + lots)
    const alertesPeremption = dbAll(`SELECT p.id, p.nom, p.date_peremption, p.unite,
      julianday(p.date_peremption) - julianday('now') AS jours_restants
      FROM produits p
      WHERE p.archived = 0 AND p.date_peremption IS NOT NULL
      AND p.date_peremption <= date('now', '+90 days') AND p.stock_actuel > 0
      ORDER BY p.date_peremption ASC LIMIT 5`)

    const alertesLots = dbAll(`SELECT p.id AS produit_id, p.nom, ri.lot, ri.date_expiration,
      ri.quantite, p.unite,
      julianday(ri.date_expiration) - julianday('now') AS jours_restants
      FROM reception_items ri
      JOIN produits p ON p.id = ri.produit_id
      WHERE p.archived = 0 AND ri.date_expiration IS NOT NULL
      AND ri.date_expiration <= date('now', '+90 days') AND ri.quantite > 0
      ORDER BY ri.date_expiration ASC LIMIT 5`)

    return {
      totalProduits,
      alertesStock,
      commandesEnAttente,
      receptionsMois,
      montantMois,
      produitsAlerte,
      dernieresReceptions,
      commandesEnCours,
      alertesPeremption,
      alertesLots,
    }
  })

  // --- Stats & Analytics ---
  safeHandle('stats:monthly', () => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const ym = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })

      const achats = dbGet(`SELECT COALESCE(SUM(ri.quantite * ri.prix_unitaire), 0) as total
        FROM reception_items ri
        JOIN receptions r ON r.id = ri.reception_id
        WHERE r.date LIKE ?`, [ym + '%'])

      const conso = dbGet(`SELECT COALESCE(COUNT(DISTINCT u.id), 0) as nb,
        COALESCE(SUM(ui.quantite), 0) as total_items
        FROM utilisations u
        LEFT JOIN utilisation_items ui ON ui.utilisation_id = u.id
        WHERE u.date LIKE ?`, [ym + '%'])

      const receptions = dbGet(`SELECT COUNT(*) as nb FROM receptions WHERE date LIKE ?`, [ym + '%'])

      months.push({
        label,
        month: ym,
        achats: achats?.total || 0,
        consommations: conso?.nb || 0,
        items_consommes: conso?.total_items || 0,
        receptions: receptions?.nb || 0,
      })
    }
    return months
  })

  safeHandle('stats:topProduits', () => {
    return dbAll(`SELECT p.id, p.nom, p.reference, p.categorie,
      COALESCE(SUM(ui.quantite), 0) as total_consomme,
      COUNT(DISTINCT u.id) as nb_soins
      FROM utilisation_items ui
      JOIN utilisations u ON u.id = ui.utilisation_id
      JOIN produits p ON p.id = ui.produit_id
      WHERE u.date >= date('now', '-6 months')
      GROUP BY p.id
      ORDER BY total_consomme DESC
      LIMIT 10`)
  })

  safeHandle('stats:parCategorie', () => {
    return dbAll(`SELECT categorie, COUNT(*) as nb_produits,
      SUM(stock_actuel) as stock_total,
      SUM(stock_actuel * prix_unitaire) as valeur_stock
      FROM produits WHERE archived = 0 AND categorie IS NOT NULL
      GROUP BY categorie ORDER BY valeur_stock DESC`)
  })

  safeHandle('stats:parFournisseur', () => {
    return dbAll(`SELECT f.id, f.nom,
      COUNT(DISTINCT p.id) as nb_produits,
      COALESCE(SUM(ri.quantite * ri.prix_unitaire), 0) as total_achats
      FROM fournisseurs f
      LEFT JOIN produits p ON p.fournisseur_id = f.id AND p.archived = 0
      LEFT JOIN reception_items ri ON ri.produit_id = p.id
      LEFT JOIN receptions r ON r.id = ri.reception_id AND r.date >= date('now', '-6 months')
      WHERE f.archived = 0
      GROUP BY f.id ORDER BY total_achats DESC`)
  })

  safeHandle('stats:alertesPeremption', () => {
    // Alertes au niveau produit (date_peremption sur la fiche)
    const produitAlerts = dbAll(`SELECT p.id, p.nom, p.reference, p.date_peremption, p.stock_actuel, p.unite, 'produit' AS source
      FROM produits p
      WHERE p.archived = 0 AND p.date_peremption IS NOT NULL
      AND p.date_peremption <= date('now', '+90 days')
      ORDER BY p.date_peremption ASC`)

    // Alertes au niveau lot (date_expiration sur les reception_items)
    const lotAlerts = dbAll(`SELECT ri.id, p.id AS produit_id, p.nom, p.reference, ri.lot, ri.date_expiration AS date_peremption,
      ri.quantite AS stock_actuel, p.unite, 'lot' AS source
      FROM reception_items ri
      JOIN produits p ON p.id = ri.produit_id
      JOIN receptions r ON r.id = ri.reception_id
      WHERE p.archived = 0 AND ri.date_expiration IS NOT NULL
      AND ri.date_expiration <= date('now', '+90 days')
      AND ri.quantite > 0
      ORDER BY ri.date_expiration ASC`)

    return [...produitAlerts, ...lotAlerts]
  })

  safeHandle('stats:valeurStock', () => {
    const row = dbGet(`SELECT
      COUNT(*) as nb_produits,
      SUM(stock_actuel * prix_unitaire) as valeur_totale,
      SUM(CASE WHEN stock_actuel <= stock_minimum THEN 1 ELSE 0 END) as nb_alertes
      FROM produits WHERE archived = 0`)
    return row || { nb_produits: 0, valeur_totale: 0, nb_alertes: 0 }
  })

  // --- Commande automatique ---
  safeHandle('commandes:autoGenerate', async () => {
    const alertProducts = dbAll(`SELECT p.id, p.nom, p.stock_actuel, p.stock_minimum, p.prix_unitaire, p.fournisseur_id
      FROM produits p WHERE p.archived = 0 AND p.stock_actuel <= p.stock_minimum AND p.fournisseur_id IS NOT NULL`)

    if (alertProducts.length === 0) return { created: 0, commandes: [] }

    // Grouper par fournisseur
    const byFournisseur = {}
    alertProducts.forEach(p => {
      if (!byFournisseur[p.fournisseur_id]) byFournisseur[p.fournisseur_id] = []
      byFournisseur[p.fournisseur_id].push(p)
    })

    const createdCommandes = []
    const today = new Date().toISOString().slice(0, 10)

    await withWriteTransaction(() => {
      for (const [fournisseurId, produits] of Object.entries(byFournisseur)) {
        const refNum = Math.floor(Math.random() * 9000) + 1000
        const ref = `CMD-AUTO-${today.replace(/-/g, '')}-${refNum}`

        dbRun(`INSERT INTO commandes (date_commande, fournisseur_id, reference_commande, statut, notes)
          VALUES (?, ?, ?, 'EN_ATTENTE', 'Commande generee automatiquement')`,
          [today, fournisseurId, ref])

        const commandeId = dbGet('SELECT last_insert_rowid() as id').id

        produits.forEach(p => {
          const qte = Math.max(1, Math.ceil((p.stock_minimum * 2) - p.stock_actuel))
          dbRun(`INSERT INTO commande_items (commande_id, produit_id, quantite, prix_unitaire)
            VALUES (?, ?, ?, ?)`, [commandeId, p.id, qte, p.prix_unitaire || 0])
        })

        createdCommandes.push({ id: commandeId, reference: ref, fournisseur_id: Number(fournisseurId), nb_produits: produits.length })
      }
    })

    return { created: createdCommandes.length, commandes: createdCommandes }
  })

  // --- Export CSV ---
  safeHandle('export:csv', async (_, type) => {
    let rows = []
    let filename = ''
    let headers = []

    if (type === 'produits') {
      headers = ['Reference', 'Nom', 'Categorie', 'Unite', 'Stock', 'Seuil', 'Prix HT', 'Fournisseur', 'Peremption']
      rows = dbAll(`SELECT p.reference, p.nom, p.categorie, p.unite, p.stock_actuel, p.stock_minimum, p.prix_unitaire,
        f.nom as fournisseur_nom, p.date_peremption
        FROM produits p LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
        WHERE p.archived = 0 ORDER BY p.nom`)
      rows = rows.map(r => [r.reference || '', r.nom, r.categorie || '', r.unite, r.stock_actuel, r.stock_minimum, r.prix_unitaire, r.fournisseur_nom || '', r.date_peremption || ''])
      filename = `produits-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'commandes') {
      headers = ['Reference', 'Date', 'Fournisseur', 'Statut', 'Nb produits', 'Notes']
      rows = dbAll(`SELECT c.reference_commande, c.date_commande, f.nom as fournisseur_nom, c.statut,
        (SELECT COUNT(*) FROM commande_items ci WHERE ci.commande_id = c.id) as nb_produits, c.notes
        FROM commandes c LEFT JOIN fournisseurs f ON f.id = c.fournisseur_id ORDER BY c.date_commande DESC`)
      rows = rows.map(r => [r.reference_commande || '', r.date_commande, r.fournisseur_nom || '', r.statut, r.nb_produits, r.notes || ''])
      filename = `commandes-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'consommations') {
      headers = ['Date', 'Praticien', 'Type soin', 'Patient', 'Nb produits', 'Notes']
      rows = dbAll(`SELECT u.date, COALESCE(pr.prenom || ' ' || pr.nom, '-') as praticien, u.type_soin, u.patient_ref,
        (SELECT COUNT(*) FROM utilisation_items ui WHERE ui.utilisation_id = u.id) as nb_produits, u.notes
        FROM utilisations u LEFT JOIN praticiens pr ON pr.id = u.praticien_id ORDER BY u.date DESC`)
      rows = rows.map(r => [r.date, r.praticien, r.type_soin || '', r.patient_ref || '', r.nb_produits, r.notes || ''])
      filename = `consommations-${new Date().toISOString().slice(0, 10)}.csv`
    } else if (type === 'fournisseurs') {
      headers = ['Nom', 'Contact', 'Email', 'Telephone', 'Adresse', 'Nb produits']
      rows = dbAll(`SELECT f.nom, f.contact_commercial, f.email, f.telephone, f.adresse,
        (SELECT COUNT(*) FROM produits p WHERE p.fournisseur_id = f.id AND p.archived = 0) as nb_produits
        FROM fournisseurs f WHERE f.archived = 0 ORDER BY f.nom`)
      rows = rows.map(r => [r.nom, r.contact_commercial || '', r.email || '', r.telephone || '', r.adresse || '', r.nb_produits])
      filename = `fournisseurs-${new Date().toISOString().slice(0, 10)}.csv`
    } else {
      throw new Error(`Type d'export inconnu: ${type}`)
    }

    const csvContent = [headers.join(';'), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))].join('\n')

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Exporter en CSV',
      defaultPath: filename,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (result.canceled || !result.filePath) return null

    fs.writeFileSync(result.filePath, '\uFEFF' + csvContent, 'utf-8')
    return result.filePath
  })

  // --- Prix historique ---
  safeHandle('prix:historique', (_, produitId) => {
    return dbAll(`SELECT ph.*, f.nom as fournisseur_nom
      FROM prix_historique ph
      LEFT JOIN fournisseurs f ON f.id = ph.fournisseur_id
      WHERE ph.produit_id = ?
      ORDER BY ph.date DESC LIMIT 50`, [produitId])
  })

  // --- Recherche globale ---
  safeHandle('search:global', (_, query) => {
    if (!query || query.trim().length < 2) return { produits: [], fournisseurs: [], commandes: [] }
    const q = `%${query.trim()}%`

    const produits = dbAll(`SELECT id, reference, nom, categorie, stock_actuel, stock_minimum, unite
      FROM produits WHERE archived = 0 AND (nom LIKE ? OR reference LIKE ? OR categorie LIKE ?)
      ORDER BY nom LIMIT 10`, [q, q, q])

    const fournisseurs = dbAll(`SELECT id, nom, contact_commercial, email
      FROM fournisseurs WHERE archived = 0 AND (nom LIKE ? OR contact_commercial LIKE ? OR email LIKE ?)
      ORDER BY nom LIMIT 5`, [q, q, q])

    const commandes = dbAll(`SELECT c.id, c.reference_commande, c.date_commande, c.statut, f.nom as fournisseur_nom
      FROM commandes c LEFT JOIN fournisseurs f ON f.id = c.fournisseur_id
      WHERE c.reference_commande LIKE ? OR f.nom LIKE ?
      ORDER BY c.date_commande DESC LIMIT 5`, [q, q])

    return { produits, fournisseurs, commandes }
  })
}

module.exports = { register }
