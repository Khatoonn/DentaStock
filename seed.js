const initSqlJs = require('sql.js');
const fs = require('fs');
const dbPath = 'C:/DentaStock/data/dentastock.db';

(async () => {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  // --- FOURNISSEURS ---
  const fournisseurs = [
    ['Henry Schein', 'commandes@henryschein.fr', '01 49 88 60 00', '5 Bd de la Madeleine, 75001 Paris', 'Sophie Martin'],
    ['GACD', 'contact@gacd.fr', '01 58 10 20 30', '153 Rue de Courcelles, 75017 Paris', 'Thomas Bernard'],
    ['Mega Dental', 'info@megadental.fr', '01 45 67 89 00', '12 Rue du Commerce, 69002 Lyon', 'Claire Dupuis'],
    ['Pierre Fabre Oral Care', 'pro@pierre-fabre.com', '05 63 71 44 00', 'Avenue du Sidobre, 81100 Castres', null],
    ['Septodont', 'france@septodont.com', '01 49 76 70 00', '58 Rue du Pont de Creteil, 94100 Saint-Maur', 'Marc Leroy'],
    ['Dentsply Sirona', 'contact@dentsplysirona.com', '01 30 14 77 77', '7 Rue Gustave Courbet, 78180 Montigny', null],
    ['Kerr Dental', 'info.france@kerrdental.com', '01 41 10 75 75', 'Orange, 84100', 'Julie Renard'],
    ['3M France', 'dental.fr@3m.com', '01 30 31 69 00', '1 Bd Lucien Faure, 95006 Cergy', null],
    ['Hu-Friedy', 'france@hu-friedy.com', '01 42 56 98 00', 'Tuttlingen, Allemagne', null],
    ['CERP Rhin Rhone Mediterranee', 'commandes@cerp-rrm.fr', '04 72 82 14 14', 'ZI Lyon Nord, 69730 Genay', 'Frederic Morel'],
  ];

  fournisseurs.forEach(f => {
    db.run('INSERT INTO fournisseurs (nom, email, telephone, adresse, contact_commercial) VALUES (?, ?, ?, ?, ?)', f);
  });

  // --- CATEGORIES ---
  const categories = [
    ['Anesthesie', 'Carpules, aiguilles, seringues anesthesie'],
    ['Protection', 'Gants, masques, lunettes, surblouses'],
    ['Hygiene et sterilisation', 'Sachets, indicateurs, produits de desinfection'],
    ['Consommables', 'Compresses, cotons, rouleaux salivaires'],
    ['Endodontie', 'Limes, cones, ciments canalaires'],
    ['Composite et adhesif', 'Resines composites, bonding, mordancage'],
    ['Empreinte', 'Alginates, silicones, porte-empreintes'],
    ['Prothese', 'Ciments de scellement, provisoires, teintes'],
    ['Chirurgie', 'Fils de suture, lames, compresses hemostatiques'],
    ['Radiologie', 'Capteurs, films, tabliers plombes'],
    ['Implantologie', 'Implants, piliers, vis de cicatrisation'],
    ['Orthodontie', 'Brackets, fils, elastiques'],
    ['Blanchiment', 'Gels, gouttieres, lampes'],
    ['Instrumentation', 'Fraises, inserts ultrason, curettes'],
    ['Ciment et obturation', 'CVI, eugenate, IRM, cavit'],
  ];

  categories.forEach(c => {
    db.run('INSERT OR IGNORE INTO categories (nom, description) VALUES (?, ?)', c);
  });

  // --- PRODUITS ---
  const produits = [
    // Anesthesie
    ['SEPT-ART40', 'Articaine 4% adre 1/100 000 (Septanest)', 'Anesthesie', 'boite 50', 12, 4, 32.50, 5],
    ['SEPT-ART72', 'Articaine 4% adre 1/200 000 (Septanest)', 'Anesthesie', 'boite 50', 8, 4, 32.50, 5],
    ['SEPT-SCAN', 'Scandonest 3% sans vasoconstricteur', 'Anesthesie', 'boite 50', 5, 2, 28.00, 5],
    ['SEPT-AIG30S', 'Aiguilles 30G courtes Septoject', 'Anesthesie', 'boite 100', 6, 3, 14.90, 5],
    ['SEPT-AIG27L', 'Aiguilles 27G longues Septoject', 'Anesthesie', 'boite 100', 4, 2, 14.90, 5],
    ['HS-TOPANEST', 'Gel anesthesique topique fraise 20%', 'Anesthesie', 'tube', 3, 2, 8.50, 1],

    // Protection
    ['HS-GANT-S', 'Gants nitrile bleu S (sans poudre)', 'Protection', 'boite 100', 8, 4, 7.90, 1],
    ['HS-GANT-M', 'Gants nitrile bleu M (sans poudre)', 'Protection', 'boite 100', 12, 5, 7.90, 1],
    ['HS-GANT-L', 'Gants nitrile bleu L (sans poudre)', 'Protection', 'boite 100', 6, 3, 7.90, 1],
    ['HS-MASQ-IIR', 'Masques chirurgicaux type IIR', 'Protection', 'boite 50', 15, 5, 6.50, 1],
    ['HS-FFP2', 'Masques FFP2 bec de canard', 'Protection', 'boite 25', 4, 3, 18.90, 1],
    ['HS-SURBLO', 'Surblouses jetables', 'Protection', 'sachet 10', 5, 3, 9.80, 1],
    ['HS-LUNPRO', 'Lunettes de protection anti-buee', 'Protection', 'unite', 6, 2, 4.50, 1],
    ['HS-VISI', 'Visieres de protection jetables', 'Protection', 'boite 10', 3, 2, 12.00, 1],

    // Hygiene et sterilisation
    ['GACD-SACH-S', 'Sachets sterilisation 90x230', 'Hygiene et sterilisation', 'boite 200', 5, 2, 18.50, 2],
    ['GACD-SACH-M', 'Sachets sterilisation 135x280', 'Hygiene et sterilisation', 'boite 200', 6, 3, 22.00, 2],
    ['GACD-SACH-L', 'Sachets sterilisation 200x330', 'Hygiene et sterilisation', 'boite 200', 4, 2, 26.50, 2],
    ['GACD-INDIC', 'Indicateurs chimiques classe 4', 'Hygiene et sterilisation', 'boite 250', 3, 1, 15.00, 2],
    ['HS-SURFANIOS', 'Surfanios Premium desinfectant surfaces', 'Hygiene et sterilisation', 'bidon 5L', 2, 1, 38.00, 1],
    ['HS-HEXANIOS', 'Hexanios G+R pre-desinfection instruments', 'Hygiene et sterilisation', 'bidon 5L', 2, 1, 42.00, 1],
    ['HS-SPRAY', 'Spray desinfectant fauteuil Cleanisept', 'Hygiene et sterilisation', 'flacon 1L', 4, 2, 11.50, 1],

    // Consommables
    ['GACD-COMP10', 'Compresses non tissees 10x10', 'Consommables', 'sachet 100', 20, 8, 3.90, 2],
    ['GACD-COMP5', 'Compresses non tissees 5x5', 'Consommables', 'sachet 100', 15, 6, 2.80, 2],
    ['GACD-COTON', 'Rouleaux salivaires coton n2', 'Consommables', 'sachet 100', 18, 8, 2.50, 2],
    ['GACD-ASPIR', 'Canules aspiration chirurgicale', 'Consommables', 'sachet 10', 10, 4, 4.20, 2],
    ['HS-GOBEL', 'Gobelets plastique usage unique', 'Consommables', 'sachet 100', 12, 5, 3.20, 1],
    ['HS-BAVOI', 'Bavoirs patient 2 plis avec attache', 'Consommables', 'carton 500', 3, 1, 22.00, 1],
    ['HS-CANULEA', 'Canules aspiration standard', 'Consommables', 'sachet 100', 8, 3, 6.50, 1],
    ['HS-SERINGAIR', 'Embouts seringue air/eau', 'Consommables', 'sachet 100', 6, 3, 8.90, 1],

    // Endodontie
    ['DS-PROT-G', 'Limes ProTaper Gold assortiment S1-F3', 'Endodontie', 'blister 6', 4, 2, 42.00, 6],
    ['DS-PROT-N', 'Limes ProTaper Next assortiment X1-X5', 'Endodontie', 'blister 6', 3, 2, 45.00, 6],
    ['DS-KFILE25', 'Limes K-files 25mm assortiment 15-40', 'Endodontie', 'blister 6', 6, 3, 8.50, 6],
    ['DS-GPGOLD', 'Cones gutta percha ProTaper Gold', 'Endodontie', 'boite 60', 3, 1, 28.00, 6],
    ['DS-PAPPT', 'Pointes papier ProTaper assortiment', 'Endodontie', 'boite 180', 4, 2, 12.00, 6],
    ['DS-EDTA', 'Gel EDTA 17% (RC Prep)', 'Endodontie', 'seringue 9g', 5, 2, 9.80, 6],
    ['HS-HYPO5', 'Hypochlorite de sodium 2.5% irrigation', 'Endodontie', 'flacon 500ml', 4, 2, 5.50, 1],
    ['DS-AH-PLUS', 'Ciment canalaire AH Plus', 'Endodontie', 'coffret', 2, 1, 58.00, 6],

    // Composite et adhesif
    ['3M-Z250-A2', 'Composite Filtek Z250 A2', 'Composite et adhesif', 'seringue 4g', 5, 2, 28.50, 8],
    ['3M-Z250-A3', 'Composite Filtek Z250 A3', 'Composite et adhesif', 'seringue 4g', 5, 2, 28.50, 8],
    ['3M-Z250-A35', 'Composite Filtek Z250 A3.5', 'Composite et adhesif', 'seringue 4g', 3, 2, 28.50, 8],
    ['3M-FLOW-A2', 'Composite fluide Filtek Flow A2', 'Composite et adhesif', 'seringue 2g', 4, 2, 22.00, 8],
    ['3M-FLOW-A3', 'Composite fluide Filtek Flow A3', 'Composite et adhesif', 'seringue 2g', 3, 2, 22.00, 8],
    ['3M-SCOTCH', 'Scotchbond Universal adhesif', 'Composite et adhesif', 'flacon 5ml', 3, 1, 68.00, 8],
    ['KERR-OPTB', 'OptiBond Solo Plus adhesif', 'Composite et adhesif', 'flacon 5ml', 2, 1, 62.00, 7],
    ['3M-MORDANC', 'Acide phosphorique 35% Scotchbond', 'Composite et adhesif', 'seringue 5ml', 4, 2, 12.50, 8],

    // Empreinte
    ['GACD-ALGI', 'Alginate Tropicalgin prise normale', 'Empreinte', 'sachet 453g', 6, 3, 9.80, 2],
    ['DS-AQUAS-M', 'Silicone Aquasil Ultra Monophase', 'Empreinte', 'cartouche 50ml', 4, 2, 32.00, 6],
    ['DS-AQUAS-LB', 'Silicone Aquasil Ultra Light Body', 'Empreinte', 'cartouche 50ml', 4, 2, 28.00, 6],
    ['DS-AQUAS-HB', 'Silicone Aquasil Ultra Heavy Body', 'Empreinte', 'cartouche 380ml', 2, 1, 52.00, 6],
    ['GACD-PE-S', 'Porte-empreintes metalliques S (lot 6)', 'Empreinte', 'lot', 2, 1, 18.00, 2],
    ['GACD-PE-M', 'Porte-empreintes metalliques M (lot 6)', 'Empreinte', 'lot', 2, 1, 18.00, 2],

    // Prothese
    ['3M-RELY-X', 'RelyX Unicem 2 ciment adhesif', 'Prothese', 'clicker 8.5g', 2, 1, 85.00, 8],
    ['DS-TEMPB', 'Temp Bond ciment provisoire', 'Prothese', 'tube', 3, 1, 18.50, 6],
    ['DS-INTEGR', 'Integrity TempGrip provisoire A2', 'Prothese', 'cartouche 76g', 2, 1, 45.00, 6],
    ['VITA-A1D', 'Teintier VITA Classical A1-D4', 'Prothese', 'unite', 1, 0, 95.00, 3],

    // Chirurgie
    ['HS-SUTUR3', 'Fils suture soie tressee 3/0', 'Chirurgie', 'boite 12', 4, 2, 14.50, 1],
    ['HS-SUTUR4', 'Fils suture soie tressee 4/0', 'Chirurgie', 'boite 12', 3, 2, 14.50, 1],
    ['HS-LAME15', 'Lames bistouri n15 steriles', 'Chirurgie', 'boite 100', 2, 1, 12.00, 1],
    ['HS-SURGI', 'Surgicel compresses hemostatiques', 'Chirurgie', 'boite 12', 2, 1, 48.00, 1],
    ['HS-COLLAP', 'Collagene hemostatique Pangen', 'Chirurgie', 'boite 10', 2, 1, 35.00, 1],

    // Radiologie
    ['GACD-CAPT2', 'Protections capteur radio taille 2', 'Radiologie', 'boite 500', 3, 1, 28.00, 2],
    ['GACD-CAPT1', 'Protections capteur radio taille 1', 'Radiologie', 'boite 500', 2, 1, 28.00, 2],
    ['HS-TABLIER', 'Tablier plombe patient 0.5mm Pb', 'Radiologie', 'unite', 2, 1, 120.00, 1],

    // Instrumentation
    ['KERR-FD-012', 'Fraises diamantees rondes 012 (lot 5)', 'Instrumentation', 'lot', 6, 3, 12.50, 7],
    ['KERR-FD-016', 'Fraises diamantees cylindriques 016 (lot 5)', 'Instrumentation', 'lot', 5, 3, 12.50, 7],
    ['KERR-FD-FLA', 'Fraises diamantees flamme 018 (lot 5)', 'Instrumentation', 'lot', 4, 2, 12.50, 7],
    ['KERR-FC-014', 'Fraises carbure tungstene rondes 014 (lot 5)', 'Instrumentation', 'lot', 4, 2, 14.00, 7],
    ['DS-INSERT-P', 'Inserts ultrason detartrage P (lot 3)', 'Instrumentation', 'lot', 3, 1, 65.00, 6],
    ['HF-CURET', 'Curettes Gracey 5/6 7/8 assortiment', 'Instrumentation', 'set', 2, 1, 85.00, 9],
    ['HS-POLIR', 'Cupules et brossettes polissage (lot 30)', 'Instrumentation', 'lot', 4, 2, 15.00, 1],

    // Ciment et obturation
    ['DS-CAVIT', 'Cavit W obturation temporaire', 'Ciment et obturation', 'pot 28g', 3, 1, 9.50, 6],
    ['DS-IRM', 'IRM oxyde de zinc eugenol', 'Ciment et obturation', 'coffret', 2, 1, 22.00, 6],
    ['3M-KETAC', 'Ketac Molar CVI teinte A3', 'Ciment et obturation', 'coffret', 2, 1, 55.00, 8],
    ['DS-DYCAL', 'Dycal hydroxyde de calcium coiffage', 'Ciment et obturation', 'coffret', 3, 2, 18.00, 6],

    // Blanchiment
    ['HS-BLANC16', 'Gel blanchiment peroxyde carbamide 16%', 'Blanchiment', 'kit 4 seringues', 2, 1, 42.00, 1],
    ['GACD-GOUT', 'Gouttieres thermoformables blanchiment', 'Blanchiment', 'lot 6', 3, 1, 8.50, 2],
  ];

  produits.forEach(p => {
    db.run('INSERT INTO produits (reference, nom, categorie, unite, stock_actuel, stock_minimum, prix_unitaire, fournisseur_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', p);
  });

  // --- PRATICIENS ---
  const praticiens = [
    ['Benali', 'Karim', 'chirurgien-dentiste'],
    ['Rousseau', 'Anne', 'chirurgien-dentiste'],
    ['Nguyen', 'Linh', 'orthodontiste'],
    ['Faure', 'Sandrine', 'assistant(e)'],
    ['Petit', 'Emilie', 'hygieniste'],
  ];

  praticiens.forEach(p => {
    db.run('INSERT INTO praticiens (nom, prenom, role) VALUES (?, ?, ?)', p);
  });

  // Sauvegarder
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();

  console.log('Base remplie avec succes !');
  console.log('- ' + fournisseurs.length + ' fournisseurs');
  console.log('- ' + categories.length + ' categories');
  console.log('- ' + produits.length + ' produits');
  console.log('- ' + praticiens.length + ' praticiens');
})();
