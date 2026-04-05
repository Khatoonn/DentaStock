"""
Generate DentaStock presentation PDF with screenshots
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Image
)
from reportlab.pdfgen import canvas
import os

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')

# Colors
SKY = HexColor('#0ea5e9')
EMERALD = HexColor('#10b981')
SLATE_800 = HexColor('#1e293b')
SLATE_700 = HexColor('#334155')
SLATE_400 = HexColor('#94a3b8')
SLATE_100 = HexColor('#f1f5f9')
AMBER = HexColor('#f59e0b')
RED = HexColor('#ef4444')
VIOLET = HexColor('#8b5cf6')
ROSE = HexColor('#f43f5e')
TEAL = HexColor('#14b8a6')
INDIGO = HexColor('#6366f1')

PAGE_W = A4[0] - 5*cm  # usable width (margins 2.5cm each side)

# Styles
TITLE_STYLE = ParagraphStyle(
    'CustomTitle', fontName='Helvetica-Bold', fontSize=28,
    textColor=SLATE_800, spaceAfter=6, alignment=TA_LEFT
)
SUBTITLE_STYLE = ParagraphStyle(
    'CustomSubtitle', fontName='Helvetica', fontSize=14,
    textColor=SLATE_400, spaceAfter=20, alignment=TA_LEFT
)
H1_STYLE = ParagraphStyle(
    'H1', fontName='Helvetica-Bold', fontSize=20,
    textColor=SLATE_800, spaceBefore=16, spaceAfter=10, alignment=TA_LEFT
)
H2_STYLE = ParagraphStyle(
    'H2', fontName='Helvetica-Bold', fontSize=14,
    textColor=SKY, spaceBefore=12, spaceAfter=6, alignment=TA_LEFT
)
BODY_STYLE = ParagraphStyle(
    'Body', fontName='Helvetica', fontSize=10.5,
    textColor=SLATE_800, spaceAfter=8, alignment=TA_JUSTIFY,
    leading=15
)
BULLET_STYLE = ParagraphStyle(
    'Bullet', fontName='Helvetica', fontSize=10.5,
    textColor=SLATE_800, spaceAfter=5, leftIndent=20, bulletIndent=8,
    leading=14
)
SMALL_STYLE = ParagraphStyle(
    'Small', fontName='Helvetica', fontSize=9,
    textColor=SLATE_400, spaceAfter=4, alignment=TA_LEFT
)
CAPTION_STYLE = ParagraphStyle(
    'Caption', fontName='Helvetica-Oblique', fontSize=9,
    textColor=SLATE_400, spaceAfter=12, alignment=TA_CENTER,
    spaceBefore=4
)
FOOTER_STYLE = ParagraphStyle(
    'Footer', fontName='Helvetica', fontSize=8,
    textColor=SLATE_400, alignment=TA_CENTER
)

def header_footer(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setStrokeColor(SKY)
    canvas_obj.setLineWidth(2)
    canvas_obj.line(2*cm, A4[1] - 1.5*cm, A4[0] - 2*cm, A4[1] - 1.5*cm)
    canvas_obj.setFont('Helvetica', 8)
    canvas_obj.setFillColor(SLATE_400)
    canvas_obj.drawCentredString(A4[0]/2, 1.2*cm, f"DentaStock v2.3.0 - Presentation du logiciel - Page {doc.page}")
    canvas_obj.restoreState()

def first_page(canvas_obj, doc):
    canvas_obj.saveState()
    canvas_obj.setFillColor(SKY)
    canvas_obj.rect(0, A4[1] - 8*cm, A4[0], 8*cm, fill=True, stroke=False)
    canvas_obj.setFont('Helvetica-Bold', 42)
    canvas_obj.setFillColor(white)
    canvas_obj.drawString(2.5*cm, A4[1] - 4*cm, "DentaStock")
    canvas_obj.setFont('Helvetica', 18)
    canvas_obj.drawString(2.5*cm, A4[1] - 5.2*cm, "Gestion de stock pour cabinet dentaire")
    canvas_obj.setFont('Helvetica', 13)
    canvas_obj.drawString(2.5*cm, A4[1] - 6.5*cm, "Version 2.3.0  |  Application desktop  |  Reseau local")
    canvas_obj.setFont('Helvetica', 9)
    canvas_obj.setFillColor(SLATE_400)
    canvas_obj.drawCentredString(A4[0]/2, 1.5*cm, "Document de presentation - Confidentiel")
    canvas_obj.restoreState()

def make_feature_table(features, color):
    data = []
    for f in features:
        data.append([
            Paragraph(f'<font color="#{color.hexval()[2:]}">\u2022</font>', BODY_STYLE),
            Paragraph(f, BODY_STYLE)
        ])
    t = Table(data, colWidths=[0.8*cm, 14.5*cm])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (0,-1), 0),
    ]))
    return t

def screenshot(name, caption=None):
    """Return a list of flowables for a screenshot with optional caption and border."""
    img_path = os.path.join(SCREENSHOT_DIR, f'{name}.png')
    if not os.path.exists(img_path):
        return [Paragraph(f"<i>[Capture d'ecran : {name}]</i>", SMALL_STYLE)]

    img = Image(img_path, width=PAGE_W, height=PAGE_W * 9/14)  # 14:9 aspect ratio
    img.hAlign = 'CENTER'

    # Wrap in a table for border
    t = Table([[img]], colWidths=[PAGE_W + 4*mm])
    t.setStyle(TableStyle([
        ('BORDER', (0,0), (-1,-1), 1, SLATE_400),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 2*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 2*mm),
        ('BACKGROUND', (0,0), (-1,-1), HexColor('#0f172a')),
    ]))

    elements = [Spacer(1, 0.3*cm), t]
    if caption:
        elements.append(Paragraph(caption, CAPTION_STYLE))
    else:
        elements.append(Spacer(1, 0.3*cm))
    return elements

def build():
    doc = SimpleDocTemplate(
        r"E:\001\DentaStock-Presentation.pdf",
        pagesize=A4,
        topMargin=2.5*cm, bottomMargin=2*cm,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
        title="DentaStock - Presentation",
        author="DentaStock",
    )

    story = []

    # ---- PAGE 1: Cover ----
    story.append(Spacer(1, 7*cm))
    story.append(Paragraph("Sommaire", H1_STYLE))
    story.append(Spacer(1, 0.5*cm))

    toc_items = [
        "1. Presentation generale",
        "2. Tableau de bord et alertes",
        "3. Gestion des produits et du stock",
        "4. Commandes fournisseurs et receptions",
        "5. Inventaire physique et retours",
        "6. Consommation et tracabilite",
        "7. Statistiques et indicateurs",
        "8. Fournisseurs et remises",
        "9. Fonctionnalites avancees",
        "10. Architecture technique",
        "11. Securite et sauvegarde",
    ]
    for item in toc_items:
        story.append(Paragraph(item, ParagraphStyle(
            'TOC', fontName='Helvetica', fontSize=12,
            textColor=SLATE_800, spaceAfter=8, leftIndent=1*cm, leading=16
        )))

    story.append(PageBreak())

    # ---- PAGE 2: Presentation generale ----
    story.append(Paragraph("1. Presentation generale", H1_STYLE))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph(
        "<b>DentaStock</b> est un logiciel de bureau concu pour simplifier et optimiser la gestion "
        "des stocks de consommables dans les cabinets dentaires. Il offre une solution complete, "
        "du suivi des produits a la generation automatique de commandes, en passant par l'analyse "
        "statistique de la consommation.",
        BODY_STYLE
    ))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Points forts", H2_STYLE))
    story.append(make_feature_table([
        "<b>Interface moderne</b> - Design professionnel avec mode sombre et mode clair",
        "<b>Fonctionnement en reseau local</b> - Base de donnees partagee entre plusieurs postes",
        "<b>Aucune connexion internet requise</b> - Toutes les donnees restent dans le cabinet",
        "<b>Installation simple</b> - Installeur Windows avec assistant de configuration",
        "<b>Mise a jour automatique</b> - Notification et installation des nouvelles versions",
        "<b>Sauvegarde automatique</b> - Protection des donnees avec restauration en un clic",
    ], EMERALD))

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Public cible", H2_STYLE))
    story.append(Paragraph(
        "Cabinets dentaires (1 a 10 praticiens), assistant(e)s dentaires en charge du stock, "
        "gestionnaires de cabinet, groupements de cabinets.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE 3: Tableau de bord ----
    story.append(Paragraph("2. Tableau de bord et alertes", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph(
        "Le tableau de bord offre une vue synthetique de l'activite du cabinet avec des indicateurs "
        "en temps reel : nombre de produits, alertes de stock, commandes en attente, depenses du mois.",
        BODY_STYLE
    ))

    story.extend(screenshot('dashboard', "Vue du tableau de bord avec alertes stock et peremption"))

    story.append(make_feature_table([
        "Nombre de produits references et alertes de stock en cours",
        "<b>Alertes de peremption</b> - produits et lots proches de l'expiration (bandeau ambre)",
        "Commandes en attente de reception",
        "Montant des achats du mois en cours",
        "Graphique des depenses mensuelles (6 derniers mois)",
        "Listes des produits a commander et des dernieres receptions",
        "<b>Notifications Windows</b> - alertes au demarrage pour stock bas et peremptions proches",
    ], SKY))

    story.append(PageBreak())

    # ---- PAGE 4: Gestion des produits ----
    story.append(Paragraph("3. Gestion des produits et du stock", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Catalogue produits", H2_STYLE))
    story.append(Paragraph(
        "Le catalogue centralise l'ensemble des produits du cabinet avec recherche, filtrage "
        "par categorie, onglets actifs/archives, et boutons d'action rapides.",
        BODY_STYLE
    ))

    story.extend(screenshot('produits', "Page Produits & Stock avec commande auto et export CSV"))

    story.append(make_feature_table([
        "Catalogue complet avec reference, nom, categorie, unite et prix HT/TTC",
        "<b>Code-barres EAN</b> - Champ dedie avec recherche par scan ou saisie",
        "Gestion des dates de peremption avec alertes visuelles (30j / 90j)",
        "Archivage et restauration des produits obsoletes",
        "Pagination des listes pour les grands catalogues (25 elements/page)",
        "<b>Onglet Inventaire</b> - Comparaison stock theorique / reel avec ajustements en lot",
    ], SKY))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Seuils intelligents", H2_STYLE))
    story.append(Paragraph(
        "DentaStock propose un <b>outil d'analyse de consommation</b> qui calcule automatiquement "
        "le seuil optimal pour chaque produit, base sur la consommation des 6 derniers mois, "
        "le delai moyen de livraison, et une marge de securite de 30%. "
        "Le praticien peut appliquer le seuil recommande en un clic.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE 5: Commandes et receptions ----
    story.append(Paragraph("4. Commandes fournisseurs et receptions", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Cycle de commande complet", H2_STYLE))
    story.append(Paragraph(
        "DentaStock gere l'integralite du cycle d'approvisionnement :",
        BODY_STYLE
    ))

    workflow_data = [
        [Paragraph("<b>Etape</b>", BODY_STYLE), Paragraph("<b>Description</b>", BODY_STYLE)],
        [Paragraph("1. Detection", BODY_STYLE), Paragraph("Alerte automatique quand le stock descend sous le seuil", BODY_STYLE)],
        [Paragraph("2. Commande", BODY_STYLE), Paragraph("Creation manuelle ou automatique de la commande fournisseur", BODY_STYLE)],
        [Paragraph("3. Suivi", BODY_STYLE), Paragraph("Statuts : En attente, Partielle, Receptionnee, Archivee", BODY_STYLE)],
        [Paragraph("4. Reception", BODY_STYLE), Paragraph("Saisie des quantites recues, prix, numero de lot", BODY_STYLE)],
        [Paragraph("5. Mise en stock", BODY_STYLE), Paragraph("Mise a jour automatique du stock et de l'historique des prix", BODY_STYLE)],
        [Paragraph("6. Export PDF", BODY_STYLE), Paragraph("Bon de commande imprimable au format PDF (bouton par commande)", BODY_STYLE)],
    ]
    wt = Table(workflow_data, colWidths=[3.5*cm, 12*cm])
    wt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SKY),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('BACKGROUND', (0,1), (-1,-1), SLATE_100),
        ('GRID', (0,0), (-1,-1), 0.5, SLATE_400),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(wt)

    story.extend(screenshot('reception', "Page de reception des commandes"))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Recherche produit intelligente", H2_STYLE))
    story.append(Paragraph(
        "Lors de la creation d'une commande ou d'une reception, un champ de <b>recherche autocomplete</b> "
        "permet de retrouver un produit par son nom, sa reference ou son <b>code-barres</b>. "
        "Compatible avec les lecteurs de code-barres USB.",
        BODY_STYLE
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Reception rapide", H2_STYLE))
    story.append(Paragraph(
        "Boutons <b>\"Tout receptionne\"</b> par ligne et <b>\"Reception complete\"</b> globale pour valider "
        "rapidement toute la commande. Colonne <b>Recu / Commande</b> visible lors de l'edition "
        "d'une commande partielle.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE: Inventaire et retours ----
    story.append(Paragraph("5. Inventaire physique et retours", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Inventaire physique", H2_STYLE))
    story.append(Paragraph(
        "L'onglet <b>Inventaire</b> de la page Produits permet de realiser un inventaire physique : "
        "chaque produit affiche son stock theorique, et l'utilisateur saisit le stock reel. "
        "L'ecart est calcule en temps reel avec code couleur (vert/rouge). "
        "Un bouton <b>\"Valider les ajustements\"</b> applique toutes les corrections en une seule operation.",
        BODY_STYLE
    ))

    story.append(make_feature_table([
        "Filtre de recherche pour cibler les produits a inventorier",
        "Affichage de l'ecart stock theorique / reel avec code couleur",
        "Application en lot de tous les ajustements avec confirmation",
    ], AMBER))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Retours fournisseur", H2_STYLE))
    story.append(Paragraph(
        "Le module <b>Retours</b> (accessible depuis la page Reception) permet d'enregistrer "
        "les produits retournes a un fournisseur (defectueux, perimes, rappel fabricant, erreur). "
        "Le stock est automatiquement deduit lors de la validation du retour.",
        BODY_STYLE
    ))

    story.append(make_feature_table([
        "Motifs predefinis : defectueux, perime, erreur commande, rappel fabricant",
        "Recherche produit avec autocomplete (nom, reference, code-barres)",
        "Historique complet des retours avec montant total par fournisseur",
        "Deduction automatique du stock a la validation",
    ], RED))

    story.append(PageBreak())

    # ---- PAGE: Consommation ----
    story.append(Paragraph("6. Consommation et tracabilite", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("Saisie de consommation", H2_STYLE))
    story.append(make_feature_table([
        "Declaration des produits utilises par acte et par praticien",
        "Selection du type de soin (detartrage, obturation, extraction, pose implant...)",
        "Decrementation automatique du stock",
        "Historique complet des utilisations avec detail par praticien",
    ], VIOLET))

    story.extend(screenshot('consommation', "Ecran de saisie de consommation"))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Tracabilite des lots", H2_STYLE))
    story.append(Paragraph(
        "Lors de la reception, il est possible de saisir le <b>numero de lot</b> et la <b>date d'expiration</b> "
        "de chaque produit. Ces informations sont conservees dans l'historique et permettent "
        "de remonter la chaine de tracabilite en cas de rappel de lot.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE: Statistiques ----
    story.append(Paragraph("7. Statistiques et indicateurs", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph(
        "Une page dediee aux statistiques offre des graphiques interactifs et des KPIs en temps reel :",
        BODY_STYLE
    ))

    story.extend(screenshot('statistiques', "Page Statistiques avec KPIs et graphiques"))

    story.append(make_feature_table([
        "<b>Depenses mensuelles</b> - Graphique en barres des achats sur 6 mois",
        "<b>Top 10 produits consommes</b> - Les produits les plus utilises",
        "<b>Repartition par categorie</b> - Camembert de la valeur du stock",
        "<b>Achats par fournisseur</b> - Volume d'achat par partenaire",
        "<b>Alertes de peremption</b> - Produits proches de l'expiration",
        "<b>KPIs</b> - Valeur totale du stock, nombre d'alertes, tendances",
    ], INDIGO))

    story.append(PageBreak())

    # ---- PAGE: Fournisseurs ----
    story.append(Paragraph("8. Fournisseurs et remises", H1_STYLE))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph(
        "Le module Fournisseurs centralise les informations de contact, le catalogue produits "
        "associe, et les conditions commerciales.",
        BODY_STYLE
    ))

    story.extend(screenshot('fournisseurs', "Gestion des fournisseurs avec export CSV"))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Remises par palier", H2_STYLE))
    story.append(Paragraph(
        "Chaque fournisseur peut avoir des <b>paliers de remise</b> configures (ex : -5% a partir de "
        "50 unites, -10% a partir de 100 unites). Lors du calcul du prix, DentaStock applique "
        "automatiquement la remise correspondante et affiche le prix <b>HT</b>, la <b>TVA</b> et le prix <b>TTC</b>.",
        BODY_STYLE
    ))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Prix HT / TTC", H2_STYLE))
    story.append(Paragraph(
        "L'application affiche systematiquement les prix hors taxes et toutes taxes comprises, "
        "avec un taux de TVA configurable (20% par defaut). Les remises fournisseur sont "
        "appliquees avant le calcul de la TVA.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE: Fonctionnalites avancees ----
    story.append(Paragraph("9. Fonctionnalites avancees", H1_STYLE))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Export CSV", H2_STYLE))
    story.append(Paragraph(
        "Toutes les donnees sont exportables en CSV (compatible Excel) : produits, commandes, "
        "receptions, consommations, fournisseurs. Le format utilise le separateur point-virgule "
        "et l'encodage UTF-8 avec BOM pour une ouverture directe dans Excel.",
        BODY_STYLE
    ))

    story.append(Paragraph("Recherche globale", H2_STYLE))
    story.append(Paragraph(
        "Une barre de recherche accessible via <b>Ctrl+K</b> permet de trouver instantanement "
        "un produit, un fournisseur ou une commande depuis n'importe quel ecran de l'application.",
        BODY_STYLE
    ))

    story.append(Paragraph("Mode sombre / clair", H2_STYLE))
    story.append(Paragraph(
        "L'interface s'adapte a la preference de l'utilisateur avec un basculement instantane "
        "entre mode sombre et mode clair.",
        BODY_STYLE
    ))

    story.append(Paragraph("Raccourcis clavier", H2_STYLE))
    story.append(Paragraph(
        "Navigation rapide avec Alt+1 a Alt+9 pour acceder aux differentes sections. "
        "Ctrl+K pour la recherche globale, Ctrl+N pour creer un nouveau produit.",
        BODY_STYLE
    ))

    story.append(Paragraph("Export PDF bon de commande", H2_STYLE))
    story.append(Paragraph(
        "Chaque commande dispose d'un bouton <b>PDF</b> qui genere un bon de commande professionnel "
        "avec en-tete du cabinet, coordonnees du fournisseur, tableau des produits et totaux. "
        "Le PDF est enregistrable directement pour envoi par email.",
        BODY_STYLE
    ))

    story.append(Paragraph("Impression et GED", H2_STYLE))
    story.append(Paragraph(
        "Le module Documents/GED permet le stockage et la consultation des bons de livraison et factures.",
        BODY_STYLE
    ))

    story.append(Paragraph("Notifications toast", H2_STYLE))
    story.append(Paragraph(
        "Systeme de notifications non-intrusif avec confirmations visuelles pour toutes les "
        "actions. Les confirmations de suppression utilisent un dialogue integre.",
        BODY_STYLE
    ))

    story.extend(screenshot('parametres', "Page Parametres : partage reseau, sauvegarde, restauration"))

    story.append(PageBreak())

    # ---- PAGE: Architecture technique ----
    story.append(Paragraph("10. Architecture technique", H1_STYLE))
    story.append(Spacer(1, 0.3*cm))

    tech_data = [
        [Paragraph("<b>Composant</b>", BODY_STYLE), Paragraph("<b>Technologie</b>", BODY_STYLE), Paragraph("<b>Role</b>", BODY_STYLE)],
        [Paragraph("Runtime", BODY_STYLE), Paragraph("Electron 29", BODY_STYLE), Paragraph("Application desktop cross-platform", BODY_STYLE)],
        [Paragraph("Interface", BODY_STYLE), Paragraph("React 18 + Tailwind CSS 3", BODY_STYLE), Paragraph("UI reactive et responsive", BODY_STYLE)],
        [Paragraph("Build", BODY_STYLE), Paragraph("Vite 5", BODY_STYLE), Paragraph("Bundling rapide du frontend", BODY_STYLE)],
        [Paragraph("Base de donnees", BODY_STYLE), Paragraph("SQLite (sql.js / WASM)", BODY_STYLE), Paragraph("Stockage local performant", BODY_STYLE)],
        [Paragraph("Graphiques", BODY_STYLE), Paragraph("Recharts", BODY_STYLE), Paragraph("Visualisation de donnees", BODY_STYLE)],
        [Paragraph("Installeur", BODY_STYLE), Paragraph("electron-builder / NSIS", BODY_STYLE), Paragraph("Installation Windows", BODY_STYLE)],
        [Paragraph("Mise a jour", BODY_STYLE), Paragraph("electron-updater", BODY_STYLE), Paragraph("Auto-update via GitHub Releases", BODY_STYLE)],
    ]
    tt = Table(tech_data, colWidths=[3.5*cm, 5.5*cm, 6.5*cm])
    tt.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), SLATE_800),
        ('TEXTCOLOR', (0,0), (-1,0), white),
        ('BACKGROUND', (0,1), (-1,-1), SLATE_100),
        ('GRID', (0,0), (-1,-1), 0.5, SLATE_400),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, SLATE_100]),
    ]))
    story.append(tt)

    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph("Mode reseau", H2_STYLE))
    story.append(Paragraph(
        "DentaStock fonctionne en <b>reseau local</b> : la base de donnees SQLite est stockee sur un "
        "dossier partage (NAS, serveur de fichiers). Chaque poste du cabinet accede a la meme base. "
        "Un systeme de verrouillage empeche les conflits d'ecriture. Aucun serveur dedie n'est necessaire.",
        BODY_STYLE
    ))

    story.append(PageBreak())

    # ---- PAGE: Securite ----
    story.append(Paragraph("11. Securite et sauvegarde", H1_STYLE))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Sauvegarde", H2_STYLE))
    story.append(make_feature_table([
        "<b>Sauvegarde automatique</b> - La base est sauvegardee periodiquement",
        "<b>Sauvegarde manuelle</b> - Declenchement a la demande depuis les parametres",
        "<b>Restauration</b> - Liste des sauvegardes disponibles avec restauration en un clic",
        "<b>Export/Import</b> - Export complet de la base pour transfert ou archivage",
    ], EMERALD))

    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Protection des donnees", H2_STYLE))
    story.append(make_feature_table([
        "Donnees stockees localement, aucun envoi vers le cloud",
        "Pas de creation de compte, pas de collecte de donnees personnelles",
        "Archivage plutot que suppression pour eviter les pertes accidentelles",
        "Confirmation systematique avant toute action destructive",
        "Gestion des erreurs avec messages clairs et recovery automatique",
    ], TEAL))

    story.append(Spacer(1, 1*cm))

    # Summary box
    summary_data = [[Paragraph(
        "<b>En resume</b><br/><br/>"
        "DentaStock est une solution complete, moderne et securisee pour la gestion du stock "
        "dans les cabinets dentaires. Son interface intuitive, ses fonctionnalites d'analyse "
        "avancees (seuils intelligents, statistiques, remises fournisseurs) et son fonctionnement "
        "en reseau local en font un outil indispensable pour optimiser les couts et eviter "
        "les ruptures de stock.<br/><br/>"
        "<b>Version actuelle :</b> 2.3.0<br/>"
        "<b>Plateforme :</b> Windows (10/11)<br/>"
        "<b>Licence :</b> Logiciel proprietaire",
        BODY_STYLE
    )]]
    st = Table(summary_data, colWidths=[15.5*cm])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), HexColor('#f0f9ff')),
        ('BORDER', (0,0), (-1,-1), 1.5, SKY),
        ('TOPPADDING', (0,0), (-1,-1), 12),
        ('BOTTOMPADDING', (0,0), (-1,-1), 12),
        ('LEFTPADDING', (0,0), (-1,-1), 14),
        ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ('ROUNDEDCORNERS', [6, 6, 6, 6]),
    ]))
    story.append(st)

    # Build
    doc.build(story, onFirstPage=first_page, onLaterPages=header_footer)
    print("PDF genere avec succes: E:\\001\\DentaStock-Presentation.pdf")

if __name__ == '__main__':
    build()
