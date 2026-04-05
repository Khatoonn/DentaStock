"""
Generate a realistic demo database for DentaStock
Simulates a dental cabinet using the software for ~6 months (Oct 2025 - Apr 2026)
"""
import sqlite3
import random
import os
from datetime import datetime, timedelta, date

DB_PATH = os.path.join(os.path.dirname(__file__), 'demo-dentastock.db')
START_DATE = date(2025, 10, 15)
TODAY = date(2026, 4, 4)

random.seed(42)

# ---------- DATA ----------

FOURNISSEURS = [
    ("Henry Schein", "commandes@henryschein.fr", "01 41 40 84 00", "5 Boulevard de la Madeleine, 75001 Paris", "Marie Dupont"),
    ("Gacd", "contact@gacd.fr", "01 56 07 07 07", "12 Rue de la Paix, 69002 Lyon", "Jean Martin"),
    ("Mega Dental", "info@megadental.fr", "04 78 92 33 00", "8 Av. des Champs, 33000 Bordeaux", "Sophie Leroy"),
    ("Dental Express", "pro@dentalexpress.fr", "03 88 10 25 00", "22 Rue Nationale, 67000 Strasbourg", "Pierre Blanc"),
    ("Promodentaire", "service@promodentaire.fr", "05 61 99 44 00", "15 Allees Jean Jaures, 31000 Toulouse", "Claire Moreau"),
]

CATEGORIES = [
    ("Anesthesie", "Produits d'anesthesie locale"),
    ("Composite", "Resines composites et bonding"),
    ("Empreinte", "Materiaux a empreinte"),
    ("Endodontie", "Limes, cones, ciments canalaires"),
    ("Hygiene", "Produits d'hygiene et desinfection"),
    ("Implantologie", "Composants implantaires"),
    ("Orthodontie", "Brackets, fils, elastiques"),
    ("Prothese", "Materiaux de prothese"),
    ("Chirurgie", "Instruments et consommables chirurgicaux"),
    ("Radiologie", "Capteurs, films, produits radio"),
]

# (ref, nom, categorie, unite, prix, fournisseur_idx, stock_min, taux_tva)
PRODUITS = [
    ("ANE-001", "Articaine 4% 1/100 000", "Anesthesie", "boite", 28.50, 0, 5, 20),
    ("ANE-002", "Lidocaine 2% adrenalinee", "Anesthesie", "boite", 22.00, 0, 3, 20),
    ("ANE-003", "Mepivacaine 3% sans vaso", "Anesthesie", "boite", 25.00, 0, 3, 20),
    ("ANE-004", "Aiguilles 30G courtes (100)", "Anesthesie", "boite", 12.50, 0, 4, 20),
    ("ANE-005", "Aiguilles 27G longues (100)", "Anesthesie", "boite", 13.00, 0, 3, 20),
    ("COM-001", "Composite A2 seringue 4g", "Composite", "seringue", 18.90, 1, 6, 20),
    ("COM-002", "Composite A3 seringue 4g", "Composite", "seringue", 18.90, 1, 6, 20),
    ("COM-003", "Composite A3.5 seringue 4g", "Composite", "seringue", 18.90, 1, 4, 20),
    ("COM-004", "Adhesif mono-composant 5ml", "Composite", "flacon", 42.00, 1, 3, 20),
    ("COM-005", "Acide orthophosphorique 37%", "Composite", "seringue", 8.50, 1, 5, 20),
    ("COM-006", "Strips de polissage (150)", "Composite", "boite", 15.00, 1, 2, 20),
    ("EMP-001", "Alginate prise rapide 500g", "Empreinte", "sachet", 9.80, 2, 8, 20),
    ("EMP-002", "Silicone putty (base+cat)", "Empreinte", "kit", 45.00, 2, 3, 20),
    ("EMP-003", "Silicone light body 50ml", "Empreinte", "cartouche", 18.50, 2, 5, 20),
    ("EMP-004", "Porte-empreinte metal T3", "Empreinte", "unite", 4.50, 2, 10, 20),
    ("EMP-005", "Porte-empreinte metal T4", "Empreinte", "unite", 4.50, 2, 10, 20),
    ("END-001", "Limes K 25mm assorties", "Endodontie", "blister", 8.00, 3, 6, 20),
    ("END-002", "Limes rotatives NiTi (6)", "Endodontie", "blister", 32.00, 3, 4, 20),
    ("END-003", "Cones de gutta assorties", "Endodontie", "boite", 14.00, 3, 3, 20),
    ("END-004", "Ciment canalaire 15g", "Endodontie", "tube", 22.00, 3, 2, 20),
    ("END-005", "Pointes papier assorties", "Endodontie", "boite", 6.50, 3, 4, 20),
    ("HYG-001", "Gants nitrile M (100)", "Hygiene", "boite", 7.90, 4, 10, 5.5),
    ("HYG-002", "Gants nitrile L (100)", "Hygiene", "boite", 7.90, 4, 8, 5.5),
    ("HYG-003", "Masques chirurgicaux (50)", "Hygiene", "boite", 5.50, 4, 6, 5.5),
    ("HYG-004", "Desinfectant surfaces 1L", "Hygiene", "flacon", 8.20, 4, 4, 20),
    ("HYG-005", "Bavettes patient (500)", "Hygiene", "rouleau", 18.00, 4, 3, 5.5),
    ("HYG-006", "Sachets sterilisation (200)", "Hygiene", "boite", 12.50, 4, 5, 20),
    ("HYG-007", "Solution hydroalcoolique 500ml", "Hygiene", "flacon", 4.90, 4, 6, 5.5),
    ("IMP-001", "Pilier implantaire titane", "Implantologie", "unite", 85.00, 0, 2, 20),
    ("IMP-002", "Vis de cicatrisation", "Implantologie", "unite", 35.00, 0, 3, 20),
    ("IMP-003", "Membrane collagene 20x30mm", "Implantologie", "unite", 65.00, 0, 2, 20),
    ("ORT-001", "Brackets ceramique (20)", "Orthodontie", "kit", 55.00, 1, 2, 20),
    ("ORT-002", "Fil NiTi .014 superieur", "Orthodontie", "unite", 4.50, 1, 5, 20),
    ("ORT-003", "Elastiques inter-maxillaires", "Orthodontie", "sachet", 3.20, 1, 8, 20),
    ("PRO-001", "Ciment provisoire 25g", "Prothese", "tube", 11.00, 2, 4, 20),
    ("PRO-002", "Ciment definitif GIC 15g", "Prothese", "kit", 28.00, 2, 3, 20),
    ("PRO-003", "Teinte vita A1-D4 (16)", "Prothese", "kit", 45.00, 2, 1, 20),
    ("CHI-001", "Lames bistouri n15 (100)", "Chirurgie", "boite", 16.00, 3, 3, 20),
    ("CHI-002", "Fil suture resorbable 4/0", "Chirurgie", "sachet", 6.80, 3, 5, 20),
    ("CHI-003", "Compresses steriles (100)", "Chirurgie", "boite", 4.50, 3, 6, 5.5),
    ("CHI-004", "Hemostatique collagene (10)", "Chirurgie", "boite", 38.00, 3, 2, 20),
    ("RAD-001", "Capteurs radio taille 2", "Radiologie", "unite", 15.00, 0, 4, 20),
    ("RAD-002", "Angulateur Rinn kit", "Radiologie", "kit", 32.00, 0, 1, 20),
]

PRATICIENS = [
    ("Dr. Benali", "Karim", "chirurgien-dentiste"),
    ("Dr. Moreau", "Isabelle", "chirurgien-dentiste"),
    ("Dr. Nguyen", "Thomas", "orthodontiste"),
    ("Mme. Petit", "Laura", "assistante dentaire"),
    ("Mme. Garcia", "Sofia", "hygieniste"),
]

SOINS = [
    "Detartrage", "Obturation composite", "Traitement endodontique",
    "Extraction simple", "Extraction chirurgicale", "Pose couronne",
    "Empreinte prothese", "Pose implant", "Controle orthodontie",
    "Soins parodontaux", "Blanchiment", "Consultation",
    "Panoramique", "Scellement sillon",
]

# Products consumed per soin (product_id, avg_qty) — ids are 1-based
SOIN_PRODUCTS = {
    "Detartrage": [(22, 1), (23, 1), (24, 1), (28, 1)],
    "Obturation composite": [(1, 1), (4, 1), (6, 1), (10, 1)],
    "Traitement endodontique": [(1, 1), (4, 1), (17, 1), (18, 1), (19, 1), (21, 1)],
    "Extraction simple": [(1, 1), (4, 1), (39, 1), (40, 1)],
    "Extraction chirurgicale": [(1, 1), (4, 1), (38, 1), (39, 1), (40, 2), (41, 1)],
    "Pose couronne": [(35, 1), (36, 1)],
    "Empreinte prothese": [(12, 1), (13, 1), (14, 1)],
    "Pose implant": [(1, 1), (29, 1), (30, 1), (39, 1), (40, 1)],
    "Controle orthodontie": [(33, 1), (34, 1)],
    "Soins parodontaux": [(24, 1), (26, 1)],
    "Blanchiment": [(22, 1)],
    "Consultation": [],
    "Panoramique": [(42, 1)],
    "Scellement sillon": [(6, 1), (10, 1)],
}

SOIN_WEIGHTS = {
    "Detartrage": 18, "Obturation composite": 22, "Traitement endodontique": 6,
    "Extraction simple": 5, "Extraction chirurgicale": 1, "Pose couronne": 4,
    "Empreinte prothese": 5, "Pose implant": 1, "Controle orthodontie": 7,
    "Soins parodontaux": 4, "Blanchiment": 2, "Consultation": 18,
    "Panoramique": 6, "Scellement sillon": 3,
}


def create_schema(cur):
    cur.executescript("""
        CREATE TABLE IF NOT EXISTS fournisseurs (
            id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL,
            email TEXT, telephone TEXT, adresse TEXT, contact_commercial TEXT,
            archived INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS produits (
            id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT, nom TEXT NOT NULL,
            categorie TEXT, unite TEXT DEFAULT 'unite', stock_actuel REAL DEFAULT 0,
            stock_minimum REAL DEFAULT 0, prix_unitaire REAL DEFAULT 0,
            fournisseur_id INTEGER REFERENCES fournisseurs(id),
            archived INTEGER DEFAULT 0, date_peremption DATE,
            taux_tva REAL DEFAULT 20, code_barre TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS praticiens (
            id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL,
            prenom TEXT, role TEXT DEFAULT 'praticien', archived INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS receptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, date DATE NOT NULL,
            fournisseur_id INTEGER REFERENCES fournisseurs(id),
            reference_bl TEXT, reference_facture TEXT,
            statut TEXT DEFAULT 'recu', notes TEXT, document_path TEXT,
            commande_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS reception_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reception_id INTEGER REFERENCES receptions(id),
            produit_id INTEGER REFERENCES produits(id),
            quantite REAL NOT NULL, prix_unitaire REAL,
            lot TEXT, date_expiration DATE
        );
        CREATE TABLE IF NOT EXISTS reception_passages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reception_id INTEGER REFERENCES receptions(id),
            date DATE NOT NULL, reference_bl TEXT, reference_facture TEXT,
            notes TEXT, document_path TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS commandes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, date_commande DATE NOT NULL,
            date_prevue DATE, fournisseur_id INTEGER REFERENCES fournisseurs(id),
            reference_commande TEXT, statut TEXT DEFAULT 'EN_ATTENTE',
            notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS commande_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            commande_id INTEGER REFERENCES commandes(id),
            produit_id INTEGER REFERENCES produits(id),
            quantite REAL NOT NULL, prix_unitaire REAL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS utilisations (
            id INTEGER PRIMARY KEY AUTOINCREMENT, date DATE NOT NULL,
            praticien_id INTEGER REFERENCES praticiens(id),
            type_soin TEXT, patient_ref TEXT, notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS utilisation_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            utilisation_id INTEGER REFERENCES utilisations(id),
            produit_id INTEGER REFERENCES produits(id),
            quantite REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
            date DATE NOT NULL, reference TEXT,
            fournisseur_id INTEGER REFERENCES fournisseurs(id),
            reception_id INTEGER REFERENCES receptions(id),
            chemin_fichier TEXT, montant REAL, notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS soins_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT, type_soin TEXT NOT NULL,
            produit_id INTEGER REFERENCES produits(id),
            quantite_defaut REAL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS config (cle TEXT PRIMARY KEY, valeur TEXT);
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT, nom TEXT NOT NULL UNIQUE,
            description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS prix_historique (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            produit_id INTEGER REFERENCES produits(id),
            fournisseur_id INTEGER, prix_unitaire REAL NOT NULL,
            date TEXT NOT NULL, source TEXT DEFAULT 'reception',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS remises_fournisseur (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fournisseur_id INTEGER REFERENCES fournisseurs(id),
            seuil_quantite INTEGER NOT NULL DEFAULT 0,
            remise_pourcent REAL NOT NULL DEFAULT 0,
            description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS retours (
            id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
            fournisseur_id INTEGER REFERENCES fournisseurs(id),
            motif TEXT, notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS retour_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retour_id INTEGER REFERENCES retours(id),
            produit_id INTEGER REFERENCES produits(id),
            quantite INTEGER NOT NULL DEFAULT 0, prix_unitaire REAL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_prix_hist_produit ON prix_historique(produit_id);
        CREATE INDEX IF NOT EXISTS idx_remises_fournisseur ON remises_fournisseur(fournisseur_id);
        CREATE INDEX IF NOT EXISTS idx_produits_fournisseur ON produits(fournisseur_id);
        CREATE INDEX IF NOT EXISTS idx_retour_items_retour ON retour_items(retour_id);
        CREATE INDEX IF NOT EXISTS idx_retour_items_produit ON retour_items(produit_id);
    """)


def rand_date(d1, d2):
    return d1 + timedelta(days=random.randint(0, max(0, (d2 - d1).days)))

def gen_lot():
    return f"LOT{random.randint(2024,2026)}{random.randint(1000,9999)}"

def gen_expiry(d):
    return d + timedelta(days=random.randint(365, 1095))

def month_start(year, month):
    return date(year, month, 1)


def main():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    create_schema(cur)

    # --- Static data ---
    for nom, email, tel, adresse, contact in FOURNISSEURS:
        cur.execute("INSERT INTO fournisseurs (nom,email,telephone,adresse,contact_commercial,created_at) VALUES (?,?,?,?,?,?)",
                    (nom, email, tel, adresse, contact, f"{START_DATE} 09:00:00"))

    for nom, desc in CATEGORIES:
        cur.execute("INSERT INTO categories (nom,description) VALUES (?,?)", (nom, desc))

    for nom, prenom, role in PRATICIENS:
        cur.execute("INSERT INTO praticiens (nom,prenom,role) VALUES (?,?,?)", (nom, prenom, role))

    for ref, nom, cat, unite, prix, fi, smin, tva in PRODUITS:
        cur.execute("INSERT INTO produits (reference,nom,categorie,unite,stock_actuel,stock_minimum,prix_unitaire,fournisseur_id,taux_tva,created_at) VALUES (?,?,?,?,0,?,?,?,?,?)",
                    (ref, nom, cat, unite, smin, prix, fi+1, tva, f"{START_DATE} 09:00:00"))

    remises = [
        (1,10,3,"3% des 10 unites"),(1,50,5,"5% des 50 unites"),(1,100,8,"8% des 100 unites"),
        (2,20,4,"4% des 20 unites"),(2,60,7,"7% des 60 unites"),
        (3,15,3.5,"3.5% des 15 unites"),(3,50,6,"6% des 50 unites"),
        (4,10,2,"2% des 10 unites"),(4,30,5,"5% des 30 unites"),
        (5,20,4,"4% des 20 unites"),(5,100,10,"10% des 100 unites"),
    ]
    for fi, sq, pct, desc in remises:
        cur.execute("INSERT INTO remises_fournisseur (fournisseur_id,seuil_quantite,remise_pourcent,description) VALUES (?,?,?,?)",
                    (fi, sq, pct, desc))

    # Soins templates
    tmpl = [
        ("Detartrage",[22,23,24,28]),("Obturation composite",[1,4,6,10]),
        ("Traitement endodontique",[1,4,17,18,19,21]),("Extraction simple",[1,4,39,40]),
        ("Empreinte prothese",[12,13,14]),("Pose implant",[1,4,29,30,39,40]),
    ]
    for soin, pids in tmpl:
        for pid in pids:
            cur.execute("INSERT INTO soins_templates (type_soin,produit_id,quantite_defaut) VALUES (?,?,1)", (soin,pid))

    # --- Stock tracking ---
    stock = {i+1: 0.0 for i in range(len(PRODUITS))}
    nprod = len(PRODUITS)

    # Group by fournisseur
    by_fourn = {}
    for i, (ref, nom, cat, unite, prix, fi, smin, tva) in enumerate(PRODUITS):
        by_fourn.setdefault(fi+1, []).append((i+1, prix, smin))

    # --- MONTHS: Oct 2025 -> Mar 2026 ---
    months = [
        (2025,10), (2025,11), (2025,12),
        (2026,1), (2026,2), (2026,3),
    ]

    cmd_id = 0
    rec_id = 0

    # ============================================================
    # Phase 1: Generate commandes + receptions (monthly restocking)
    # ============================================================
    for mi, (yr, mo) in enumerate(months):
        ms = month_start(yr, mo)
        me = month_start(yr + (1 if mo==12 else 0), (mo%12)+1) - timedelta(days=1)

        if mi == 0:
            # Initial big order: all fournisseurs, large quantities
            for fi, prods in by_fourn.items():
                odate = ms + timedelta(days=random.randint(0,3))
                rdate = odate + timedelta(days=random.randint(3,6))
                cmd_id += 1
                ref_cmd = f"CMD-{odate.strftime('%Y%m')}-{cmd_id:03d}"
                cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,notes,created_at) VALUES (?,?,?,?,?,?,?)",
                            (str(odate), str(rdate), fi, ref_cmd, "RECEPTIONNEE", "Commande initiale", f"{odate} 10:00:00"))
                rec_id += 1
                ref_bl = f"BL-{rdate.strftime('%Y%m%d')}-{rec_id:03d}"
                ref_fa = f"FA-{rdate.strftime('%Y%m')}-{random.randint(1000,9999)}"
                cur.execute("INSERT INTO receptions (date,fournisseur_id,reference_bl,reference_facture,statut,commande_id,created_at) VALUES (?,?,?,?,?,?,?)",
                            (str(rdate), fi, ref_bl, ref_fa, "recu", cmd_id, f"{rdate} 14:00:00"))
                for pid, prix, smin in prods:
                    qty = smin * random.randint(15, 25)
                    pv = round(prix * random.uniform(0.96,1.02), 2)
                    lot = gen_lot(); exp = gen_expiry(rdate)
                    cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)", (cmd_id,pid,qty,prix))
                    cur.execute("INSERT INTO reception_items (reception_id,produit_id,quantite,prix_unitaire,lot,date_expiration) VALUES (?,?,?,?,?,?)",
                                (rec_id, pid, qty, pv, lot, str(exp)))
                    cur.execute("INSERT INTO prix_historique (produit_id,fournisseur_id,prix_unitaire,date,source) VALUES (?,?,?,?,?)",
                                (pid, fi, pv, str(rdate), "reception"))
                    stock[pid] += qty
        else:
            # Monthly: 3-4 orders across fournisseurs
            fids = list(by_fourn.keys())
            random.shuffle(fids)
            for fi in fids[:random.randint(3,5)]:
                prods = by_fourn[fi]
                # Restock products low on stock
                low = [(pid,px,sm) for pid,px,sm in prods if stock[pid] < sm * 5]
                if not low:
                    low = random.sample(prods, min(2, len(prods)))
                odate = rand_date(ms, ms + timedelta(days=20))
                rdate = odate + timedelta(days=random.randint(2,7))
                if rdate > TODAY:
                    rdate = min(rdate, TODAY)
                cmd_id += 1
                ref_cmd = f"CMD-{odate.strftime('%Y%m')}-{cmd_id:03d}"
                cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,created_at) VALUES (?,?,?,?,?,?)",
                            (str(odate), str(rdate), fi, ref_cmd, "RECEPTIONNEE", f"{odate} 09:30:00"))
                rec_id += 1
                ref_bl = f"BL-{rdate.strftime('%Y%m%d')}-{rec_id:03d}"
                ref_fa = f"FA-{rdate.strftime('%Y%m')}-{random.randint(1000,9999)}"
                cur.execute("INSERT INTO receptions (date,fournisseur_id,reference_bl,reference_facture,statut,commande_id,created_at) VALUES (?,?,?,?,?,?,?)",
                            (str(rdate), fi, ref_bl, ref_fa, "recu", cmd_id, f"{rdate} 14:00:00"))
                for pid, prix, smin in low:
                    qty = random.randint(smin*6, smin*12)
                    pv = round(prix * random.uniform(0.97,1.04), 2)
                    lot = gen_lot(); exp = gen_expiry(rdate)
                    cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)", (cmd_id,pid,qty,prix))
                    cur.execute("INSERT INTO reception_items (reception_id,produit_id,quantite,prix_unitaire,lot,date_expiration) VALUES (?,?,?,?,?,?)",
                                (rec_id, pid, qty, pv, lot, str(exp)))
                    cur.execute("INSERT INTO prix_historique (produit_id,fournisseur_id,prix_unitaire,date,source) VALUES (?,?,?,?,?)",
                                (pid, fi, pv, str(rdate), "reception"))
                    stock[pid] += qty

    # --- Current month (Apr 2026): 2 EN_ATTENTE + 1 PARTIELLE ---
    # Commande en attente #1
    cmd_id += 1
    cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,notes,created_at) VALUES (?,?,?,?,?,?,?)",
                ("2026-04-01", "2026-04-08", 1, f"CMD-202604-{cmd_id:03d}", "EN_ATTENTE", "Reapprovisionnement anesthesie + implanto", "2026-04-01 09:15:00"))
    for pid in [1,2,3,4,5,29,30,31,42]:
        if pid <= nprod:
            px = PRODUITS[pid-1][4]
            cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)",
                        (cmd_id, pid, random.randint(5,15), px))

    # Commande en attente #2
    cmd_id += 1
    cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,created_at) VALUES (?,?,?,?,?,?)",
                ("2026-04-02", "2026-04-10", 4, f"CMD-202604-{cmd_id:03d}", "EN_ATTENTE", "2026-04-02 10:00:00"))
    for pid in [17,18,19,20,21,38,39,40,41]:
        if pid <= nprod:
            px = PRODUITS[pid-1][4]
            cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)",
                        (cmd_id, pid, random.randint(4,12), px))

    # Commande partielle
    cmd_id += 1
    cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,notes,created_at) VALUES (?,?,?,?,?,?,?)",
                ("2026-03-28", "2026-04-04", 2, f"CMD-202603-{cmd_id:03d}", "PARTIELLE", "Livraison partielle recue le 02/04", "2026-03-28 11:00:00"))
    partial_items = [(6,10),(7,10),(8,6),(9,4),(10,8),(32,3),(33,8),(34,12)]
    for pid, qty in partial_items:
        if pid <= nprod:
            px = PRODUITS[pid-1][4]
            cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)",
                        (cmd_id, pid, qty, px))
    # Partial reception (only some items)
    rec_id += 1
    cur.execute("INSERT INTO receptions (date,fournisseur_id,reference_bl,statut,commande_id,created_at) VALUES (?,?,?,?,?,?)",
                ("2026-04-02", 2, f"BL-20260402-{rec_id:03d}", "recu", cmd_id, "2026-04-02 15:00:00"))
    for pid, qty in [(6,10),(7,10),(10,8)]:
        pv = round(PRODUITS[pid-1][4] * random.uniform(0.98,1.01), 2)
        cur.execute("INSERT INTO reception_items (reception_id,produit_id,quantite,prix_unitaire,lot,date_expiration) VALUES (?,?,?,?,?,?)",
                    (rec_id, pid, qty, pv, gen_lot(), str(gen_expiry(date(2026,4,2)))))
        stock[pid] += qty
        cur.execute("INSERT INTO prix_historique (produit_id,fournisseur_id,prix_unitaire,date,source) VALUES (?,?,?,?,?)",
                    (pid, 2, pv, "2026-04-02", "reception"))

    # Commande archivee (vieille)
    cmd_id += 1
    cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,notes,created_at) VALUES (?,?,?,?,?,?,?)",
                ("2025-10-20", "2025-10-27", 5, f"CMD-202510-{cmd_id:03d}", "ARCHIVEE", "Premiere commande hygiene", "2025-10-20 09:00:00"))
    for pid in [22,23,24,25,26,27,28]:
        px = PRODUITS[pid-1][4]
        cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)",
                    (cmd_id, pid, random.randint(10,20), px))

    # ============================================================
    # Phase 2: Generate daily consumptions
    # ============================================================
    soin_list = list(SOIN_WEIGHTS.keys())
    soin_w = [SOIN_WEIGHTS[s] for s in soin_list]
    util_id = 0
    current = START_DATE + timedelta(days=7)

    while current < TODAY:
        if current.weekday() >= 5:
            current += timedelta(days=1)
            continue

        n_patients = random.randint(8, 16)
        for _ in range(n_patients):
            soin = random.choices(soin_list, weights=soin_w, k=1)[0]

            if soin in ("Detartrage", "Soins parodontaux", "Blanchiment"):
                prat_id = random.choice([4, 5])
            elif soin == "Controle orthodontie":
                prat_id = 3
            elif soin == "Pose implant":
                prat_id = 1
            else:
                prat_id = random.choice([1, 2])

            util_id += 1
            cur.execute("INSERT INTO utilisations (date,praticien_id,type_soin,patient_ref,created_at) VALUES (?,?,?,?,?)",
                        (str(current), prat_id, soin, f"P-{random.randint(1000,9999)}",
                         f"{current} {random.randint(8,17)}:{random.randint(0,59):02d}:00"))

            prods = SOIN_PRODUCTS.get(soin, [])
            for pid, avg_q in prods:
                if pid > nprod:
                    continue
                qty = max(1, round(avg_q * random.uniform(0.8, 1.3)))
                if stock[pid] >= qty:
                    cur.execute("INSERT INTO utilisation_items (utilisation_id,produit_id,quantite) VALUES (?,?,?)",
                                (util_id, pid, qty))
                    stock[pid] -= qty

        current += timedelta(days=1)

    # --- Emergency restocking for products at 0 (keep only 3-4 out of stock) ---
    out_of_stock = [pid for pid, qty in stock.items() if qty <= 0]
    # Keep at most 3 products at zero (realistic alerts), restock the rest
    random.shuffle(out_of_stock)
    keep_empty = out_of_stock[:3]  # these stay at 0 for realism
    restock_now = [pid for pid in out_of_stock if pid not in keep_empty]

    if restock_now:
        # Add a recent restocking reception (late March)
        rec_id += 1
        cmd_id += 1
        cur.execute("INSERT INTO commandes (date_commande,date_prevue,fournisseur_id,reference_commande,statut,notes,created_at) VALUES (?,?,?,?,?,?,?)",
                    ("2026-03-25", "2026-04-01", 1, f"CMD-202603-{cmd_id:03d}", "RECEPTIONNEE", "Reapprovisionnement urgent", "2026-03-25 09:00:00"))
        cur.execute("INSERT INTO receptions (date,fournisseur_id,reference_bl,reference_facture,statut,commande_id,created_at) VALUES (?,?,?,?,?,?,?)",
                    ("2026-04-01", 1, f"BL-20260401-{rec_id:03d}", f"FA-202604-{random.randint(1000,9999)}", "recu", cmd_id, "2026-04-01 14:00:00"))
        for pid in restock_now:
            smin = PRODUITS[pid-1][6]
            prix = PRODUITS[pid-1][4]
            qty = smin * random.randint(4, 8)
            pv = round(prix * random.uniform(0.98, 1.02), 2)
            cur.execute("INSERT INTO commande_items (commande_id,produit_id,quantite,prix_unitaire) VALUES (?,?,?,?)", (cmd_id,pid,qty,prix))
            cur.execute("INSERT INTO reception_items (reception_id,produit_id,quantite,prix_unitaire,lot,date_expiration) VALUES (?,?,?,?,?,?)",
                        (rec_id, pid, qty, pv, gen_lot(), str(gen_expiry(date(2026,4,1)))))
            cur.execute("INSERT INTO prix_historique (produit_id,fournisseur_id,prix_unitaire,date,source) VALUES (?,?,?,?,?)",
                        (pid, 1, pv, "2026-04-01", "reception"))
            stock[pid] += qty

    # Also set some products just above seuil (in alert zone) for realism
    for pid in random.sample(range(1, nprod+1), 5):
        if stock[pid] > 0:
            smin = PRODUITS[pid-1][6]
            stock[pid] = smin - random.randint(0, max(1, smin//2))
            if stock[pid] <= 0:
                stock[pid] = 1

    # --- Add code_barre to some products ---
    barcodes = {
        1: "3401560123456", 2: "3401560234567", 3: "3401560345678",
        6: "3401097001234", 7: "3401097002345", 8: "3401097003456",
        12: "3401054001234", 13: "3401054002345",
        22: "3760012345678", 23: "3760012345679",
        29: "3401085001234", 38: "3401062001234",
    }
    for pid, ean in barcodes.items():
        cur.execute("UPDATE produits SET code_barre = ? WHERE id = ?", (ean, pid))

    # --- Demo retours ---
    cur.execute("INSERT INTO retours (date, fournisseur_id, motif, notes, created_at) VALUES (?,?,?,?,?)",
                ("2026-02-15", 3, "Defectueux", "Lot de silicone durci a la reception", "2026-02-15 11:00:00"))
    cur.execute("INSERT INTO retour_items (retour_id, produit_id, quantite, prix_unitaire) VALUES (?,?,?,?)",
                (1, 13, 3, 18.50))
    cur.execute("INSERT INTO retour_items (retour_id, produit_id, quantite, prix_unitaire) VALUES (?,?,?,?)",
                (1, 14, 2, 45.00))

    cur.execute("INSERT INTO retours (date, fournisseur_id, motif, notes, created_at) VALUES (?,?,?,?,?)",
                ("2026-03-20", 1, "Perime", "Articaine lot expire avant livraison", "2026-03-20 09:30:00"))
    cur.execute("INSERT INTO retour_items (retour_id, produit_id, quantite, prix_unitaire) VALUES (?,?,?,?)",
                (2, 1, 5, 28.50))

    # --- Update final stock ---
    for pid, qty in stock.items():
        cur.execute("UPDATE produits SET stock_actuel = ? WHERE id = ?", (max(0, round(qty)), pid))

    # --- Peremption alerts (some products expiring soon) ---
    soon = random.sample(range(1, nprod+1), 6)
    for pid in soon[:2]:
        cur.execute("UPDATE produits SET date_peremption = ? WHERE id = ?",
                    (str(TODAY + timedelta(days=random.randint(5, 20))), pid))
    for pid in soon[2:4]:
        cur.execute("UPDATE produits SET date_peremption = ? WHERE id = ?",
                    (str(TODAY + timedelta(days=random.randint(25, 60))), pid))
    for pid in soon[4:]:
        cur.execute("UPDATE produits SET date_peremption = ? WHERE id = ?",
                    (str(TODAY + timedelta(days=random.randint(70, 180))), pid))

    conn.commit()

    # --- Print stats ---
    def q(sql):
        cur.execute(sql)
        return cur.fetchone()[0]

    print(f"Base generee: {DB_PATH}")
    print(f"  Fournisseurs: {q('SELECT COUNT(*) FROM fournisseurs')}")
    print(f"  Produits: {q('SELECT COUNT(*) FROM produits')}")
    print(f"  Praticiens: {q('SELECT COUNT(*) FROM praticiens')}")
    print(f"  Commandes: {q('SELECT COUNT(*) FROM commandes')}")
    for s in ['EN_ATTENTE','PARTIELLE','RECEPTIONNEE','ARCHIVEE']:
        cnt = q(f"SELECT COUNT(*) FROM commandes WHERE statut='{s}'")
        print(f"    {s}: {cnt}")
    print(f"  Receptions: {q('SELECT COUNT(*) FROM receptions')}")
    print(f"  Utilisations: {q('SELECT COUNT(*) FROM utilisations')}")
    print(f"  Lignes conso: {q('SELECT COUNT(*) FROM utilisation_items')}")
    print(f"  Historique prix: {q('SELECT COUNT(*) FROM prix_historique')}")
    print(f"  Remises: {q('SELECT COUNT(*) FROM remises_fournisseur')}")
    print(f"  Retours: {q('SELECT COUNT(*) FROM retours')}")
    print(f"  Lignes retour: {q('SELECT COUNT(*) FROM retour_items')}")
    val = q("SELECT COALESCE(SUM(stock_actuel * prix_unitaire),0) FROM produits")
    print(f"  Valeur stock: {val:.2f} EUR")
    alert_q = "SELECT COUNT(*) FROM produits WHERE stock_actuel <= stock_minimum AND stock_actuel > 0"
    print(f"  En alerte (stock <= seuil): {q(alert_q)}")
    print(f"  Epuises (stock=0): {q('SELECT COUNT(*) FROM produits WHERE stock_actuel = 0')}")
    exp_date = str(TODAY + timedelta(days=30))
    exp_cnt = q(f"SELECT COUNT(*) FROM produits WHERE date_peremption IS NOT NULL AND date_peremption <= '{exp_date}'")
    print(f"  Peremption < 30j: {exp_cnt}")

    conn.close()

if __name__ == '__main__':
    main()
