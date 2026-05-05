#!/usr/bin/env python3
"""
generar_pdf_humo.py
═══════════════════
Reporte PDF profesional (Carta Portrait) para simulaciones HYSPLIT.
Replica el diseño del dashboard RDCFT: logo Arauco arriba, mapa satelital,
coordenadas, bloques de condiciones y trayectoria, pie de página.

Dependencias:
    pip install reportlab pillow folium selenium webdriver-manager

Uso:
    from scripts.generar_pdf_humo import generar_pdf
    ruta = generar_pdf(lat=-37.45, lon=-73.35, altura=500, kmz_url='...')
"""

from __future__ import annotations

import os
import time
import tempfile
from datetime import datetime
from pathlib import Path

# ── Selenium ───────────────────────────────────────────────────────────
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options as ChromeOptions
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.chrome.service import Service as ChromeService
        _WDM = True
    except ImportError:
        _WDM = False
    _SELENIUM_OK = True
except ImportError:
    _SELENIUM_OK = False
    _WDM = False

# ── Folium ─────────────────────────────────────────────────────────────
try:
    import folium
    _FOLIUM_OK = True
except ImportError:
    _FOLIUM_OK = False

# ── ReportLab ──────────────────────────────────────────────────────────
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader


# ══════════════════════════════════════════════════════════════════════
# Paleta — alineada con el diseño de referencia
# ══════════════════════════════════════════════════════════════════════
C_TEXT    = colors.HexColor('#222222')
C_DARK    = colors.HexColor('#333333')
C_GRAY    = colors.HexColor('#666666')
C_LGRAY   = colors.HexColor('#999999')
C_LOGO    = colors.HexColor('#AAAAAA')   # gris logo Arauco
C_DIV     = colors.HexColor('#DDDDDD')   # línea divisora
C_BORDER  = colors.HexColor('#E0E0E0')   # borde caja
C_BG      = colors.HexColor('#F8F9FA')   # fondo caja
C_ACCENT  = colors.HexColor('#5CB85C')   # acento verde izquierdo
C_LABEL   = colors.HexColor('#444444')   # etiqueta sección
C_PINK    = colors.HexColor('#D9534F')   # icono lat/lon
C_LINK    = colors.HexColor('#2E7D32')   # enlace KMZ
C_WHITE   = colors.white


# ══════════════════════════════════════════════════════════════════════
# 1. Captura satelital del mapa
# ══════════════════════════════════════════════════════════════════════

def _capturar_mapa(lat: float, lon: float, zoom: int, tmp_dir: str) -> str | None:
    """Genera mapa folium con tiles Esri y lo captura con Selenium headless."""
    if not _FOLIUM_OK or not _SELENIUM_OK:
        print('[PDF] ⚠ folium/selenium no disponibles — mapa placeholder.')
        return None

    html_path = os.path.join(tmp_dir, '_mapa.html')
    img_path  = os.path.join(tmp_dir, '_mapa.png')

    m = folium.Map(
        location=[lat, lon],
        zoom_start=zoom,
        tiles=(
            'https://server.arcgisonline.com/ArcGIS/rest/services/'
            'World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ),
        attr='Esri World Imagery',
        prefer_canvas=True,
    )
    folium.Marker(
        location=[lat, lon],
        icon=folium.DivIcon(
            html=(
                '<div style="font-size:28px;line-height:1;'
                'filter:drop-shadow(0 0 8px rgba(255,60,0,.95));'
                'margin-top:-28px;margin-left:-14px;">🔥</div>'
            ),
            icon_size=(28, 28),
            icon_anchor=(14, 28),
        ),
    ).add_to(m)
    folium.CircleMarker(
        location=[lat, lon],
        radius=14, color='#FF3300', fill=False, weight=2.5, opacity=0.9,
        popup=folium.Popup(
            f'<b style="color:#E8820A">Punto de emisión</b><br>{lat:.6f}, {lon:.6f}',
            max_width=180,
        ),
    ).add_to(m)
    m.save(html_path)

    opts = ChromeOptions()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument('--hide-scrollbars')

    try:
        driver = (
            webdriver.Chrome(
                service=ChromeService(ChromeDriverManager().install()),
                options=opts,
            ) if _WDM else webdriver.Chrome(options=opts)
        )
        try:
            driver.get(Path(html_path).as_uri())
            time.sleep(4)
            driver.save_screenshot(img_path)
        finally:
            driver.quit()
        return img_path
    except Exception as e:
        print(f'[PDF] ⚠ Error capturando mapa: {e}')
        return None


# ══════════════════════════════════════════════════════════════════════
# 2. Helpers de dibujo (canvas directo)
# ══════════════════════════════════════════════════════════════════════

def _paragraph(text: str, size: float = 9, color=None,
               bold: bool = False, italic: bool = False,
               leading: float = None) -> Paragraph:
    """Paragraph simple con escapado HTML y soporte \\n → <br/>."""
    clr  = color or C_DARK
    ld   = leading or (size + 4)
    font = {(False, False): 'Helvetica',
            (True,  False): 'Helvetica-Bold',
            (False, True):  'Helvetica-Oblique',
            (True,  True):  'Helvetica-BoldOblique'}[(bold, italic)]
    style = ParagraphStyle(
        'p', fontName=font, fontSize=size, textColor=clr,
        leading=ld, spaceAfter=0, spaceBefore=0,
    )
    safe = (text or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    safe = safe.replace('\n', '<br/>')
    return Paragraph(safe, style)


def _label(c: Canvas, x: float, y: float, text: str) -> None:
    """Dibuja etiqueta de sección: uppercase bold pequeño."""
    c.setFont('Helvetica-Bold', 7.5)
    c.setFillColor(C_LABEL)
    c.drawString(x, y, text)


def _box(c: Canvas, x: float, y_bot: float, w: float, h: float) -> None:
    """Caja de contenido: fondo gris claro, borde sutil, acento verde izquierdo."""
    c.setFillColor(C_BG)
    c.setStrokeColor(C_BORDER)
    c.setLineWidth(0.5)
    c.rect(x, y_bot, w, h, fill=1, stroke=1)
    # Línea de acento (izquierda)
    c.setStrokeColor(C_ACCENT)
    c.setLineWidth(2.5)
    c.line(x + 1.25, y_bot + 4, x + 1.25, y_bot + h - 4)


def _text_in_box(c: Canvas, x: float, y_bot: float, w: float, h: float,
                 text: str, placeholder: bool = False, link: bool = False) -> None:
    """Renderiza párrafo dentro de una caja, alineado al top con padding."""
    color   = C_LGRAY if placeholder else (C_LINK if link else C_DARK)
    italic  = placeholder
    p       = _paragraph(text, size=9, color=color, italic=italic, leading=13)
    inner_w = w - 22          # 14 izquierda (después del acento) + 8 derecha
    _, ph   = p.wrapOn(c, inner_w, h - 12)
    y_draw  = max(y_bot + 6, y_bot + h - ph - 10)   # top-aligned, padding 10
    p.drawOn(c, x + 14, y_draw)


# ══════════════════════════════════════════════════════════════════════
# 3. Ensamblaje del PDF
# ══════════════════════════════════════════════════════════════════════

def _ensamblar_pdf(
    pdf_path:  str,
    lat:       float,
    lon:       float,
    altura:    int,
    kmz_url:   str,
    fecha_str: str,
    map_img:   str | None,
    cv:        str,
    cq:        str,
    nombre:    str,
    logo_path: str | None,
) -> None:

    pW, pH = letter          # 612 × 792 pt  (Portrait)
    ML = MR = 25.0           # márgenes laterales
    CW = pW - ML - MR        # 562 pt  — ancho útil

    c = Canvas(pdf_path, pagesize=(pW, pH))
    c.setFillColor(C_WHITE)
    c.rect(0, 0, pW, pH, fill=1, stroke=0)

    # ── 1. HEADER ─────────────────────────────────────────────────────
    #   y = 792 (top) → 774 (top margin) → 712 (header bottom / divider)
    HDR_TOP = pH - 18        # 774
    HDR_H   = 62
    HDR_DIV = HDR_TOP - HDR_H  # 712

    # Logo (izquierda)
    if logo_path and os.path.exists(logo_path):
        LOGO_H = 34
        c.drawImage(logo_path, ML, HDR_DIV + (HDR_H - LOGO_H) / 2,
                    130, LOGO_H, preserveAspectRatio=True, mask='auto')
    else:
        c.setFont('Helvetica', 30)
        c.setFillColor(C_LOGO)
        c.drawString(ML, HDR_DIV + 16, 'arauco')

    # Bloque título (derecha)
    c.setFont('Helvetica-Bold', 13)
    c.setFillColor(C_TEXT)
    c.drawRightString(pW - MR, HDR_TOP - 14,
                      'Simulación de Dispersión de Humo')

    c.setFont('Helvetica', 8)
    c.setFillColor(C_GRAY)
    meta = f'HYSPLIT Ensemble · Lat {lat} · Lon {lon} · Altura {altura} m'
    c.drawRightString(pW - MR, HDR_TOP - 26, meta)
    c.drawRightString(pW - MR, HDR_TOP - 38, fecha_str)

    # Línea divisora header
    c.setStrokeColor(C_DIV)
    c.setLineWidth(0.5)
    c.line(ML, HDR_DIV, pW - MR, HDR_DIV)

    # ── 2. LABEL + MAPA ───────────────────────────────────────────────
    y = HDR_DIV - 14          # 698
    _label(c, ML, y, 'PUNTO DE EMISIÓN')

    MAP_H   = 196
    MAP_TOP = y - 6           # 692
    MAP_BOT = MAP_TOP - MAP_H  # 496

    if map_img and os.path.exists(map_img):
        ir     = ImageReader(map_img)
        iw, ih = ir.getSize()
        scale  = min(CW / iw, MAP_H / ih)
        dw, dh = iw * scale, ih * scale
        ix     = ML + (CW - dw) / 2
        iy     = MAP_BOT + (MAP_H - dh) / 2
        c.drawImage(map_img, ix, iy, dw, dh,
                    preserveAspectRatio=True, mask='auto')
        c.setStrokeColor(C_BORDER)
        c.setLineWidth(0.5)
        c.rect(ML, MAP_BOT, CW, MAP_H, fill=0, stroke=1)
    else:
        c.setFillColor(colors.HexColor('#2E2E2E'))
        c.rect(ML, MAP_BOT, CW, MAP_H, fill=1, stroke=0)
        c.setFont('Helvetica', 10)
        c.setFillColor(colors.HexColor('#888888'))
        c.drawCentredString(pW / 2, MAP_BOT + MAP_H / 2 + 6,
                            'Mapa satelital no disponible')
        c.setFont('Helvetica', 8.5)
        c.setFillColor(colors.HexColor('#666666'))
        c.drawCentredString(pW / 2, MAP_BOT + MAP_H / 2 - 8,
                            f'Lat {lat}  ·  Lon {lon}')

    # ── 3. FILA DE COORDENADAS ────────────────────────────────────────
    #   Tres columnas: Latitud | Longitud | Altura emisión
    y_coord = MAP_BOT - 12    # 484
    COL     = CW / 3

    def _coord_item(x_start: float, icon: str, icon_color, label: str, value: str) -> None:
        c.setFont('Helvetica', 9)
        c.setFillColor(icon_color)
        c.drawString(x_start, y_coord, icon)
        icon_w = c.stringWidth(icon, 'Helvetica', 9) + 4
        c.setFillColor(C_GRAY)
        c.drawString(x_start + icon_w, y_coord, label)
        lbl_w = c.stringWidth(label, 'Helvetica', 9)
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(C_TEXT)
        c.drawString(x_start + icon_w + lbl_w, y_coord, value)

    _coord_item(ML,            '●', C_PINK,  'Latitud: ',       f'{lat}')
    _coord_item(ML + COL,      '●', C_PINK,  'Longitud: ',      f'{lon}')
    _coord_item(ML + 2 * COL,  '↑', C_GRAY,  'Altura emisión: ', f'{altura} m')

    # ── 4. CONDICIONES DE VIENTO ──────────────────────────────────────
    BOX_H = 80
    y = y_coord - 22           # 462
    _label(c, ML, y, 'CONDICIONES DE VIENTO')
    y_bot = y - 6 - BOX_H     # 376
    _box(c, ML, y_bot, CW, BOX_H)
    _text_in_box(c, ML, y_bot, CW, BOX_H,
                 cv if cv and cv.strip() else 'Sin comentarios.',
                 placeholder=not bool(cv and cv.strip()))

    # ── 5. CONDICIONES PARA LA QUEMA ─────────────────────────────────
    y = y_bot - 14             # 362
    _label(c, ML, y, 'CONDICIONES PARA LA QUEMA')
    y_bot = y - 6 - BOX_H     # 276
    _box(c, ML, y_bot, CW, BOX_H)
    _text_in_box(c, ML, y_bot, CW, BOX_H,
                 cq if cq and cq.strip() else 'Sin comentarios.',
                 placeholder=not bool(cq and cq.strip()))

    # ── 6. TRAYECTORIA HYSPLIT ────────────────────────────────────────
    TRAY_H = 68
    y = y_bot - 14             # 262
    _label(c, ML, y, 'TRAYECTORIA HYSPLIT')
    y_bot = y - 6 - TRAY_H    # 188

    _box(c, ML, y_bot, CW, TRAY_H)

    # "Archivo KMZ..."
    p_desc = _paragraph('Archivo KMZ disponible para visualización en Google Earth:',
                        9, C_DARK)
    _, dh = p_desc.wrapOn(c, CW - 22, 20)
    p_desc.drawOn(c, ML + 14, y_bot + TRAY_H - dh - 10)

    # URL enlace (verde)
    p_url = _paragraph(kmz_url, 8.5, C_LINK, leading=12)
    _, uh = p_url.wrapOn(c, CW - 22, TRAY_H - dh - 20)
    p_url.drawOn(c, ML + 14, y_bot + 8)

    # ── 7. FOOTER (fijado al fondo de la página) ─────────────────────
    FOOT_DIV = 50
    c.setStrokeColor(C_DIV)
    c.setLineWidth(0.5)
    c.line(ML, FOOT_DIV, pW - MR, FOOT_DIV)

    c.setFont('Helvetica', 7.5)
    c.setFillColor(C_LGRAY)
    c.drawString(ML, FOOT_DIV - 14,
                 'Modelo: NOAA HYSPLIT Ensemble · Meteorología: GFS Global')
    c.drawRightString(pW - MR, FOOT_DIV - 14, f'Generado: {fecha_str}')

    c.save()


# ══════════════════════════════════════════════════════════════════════
# 4. API pública
# ══════════════════════════════════════════════════════════════════════

def generar_pdf(
    lat:               float,
    lon:               float,
    altura:            int,
    kmz_url:           str,
    fecha_str:         str       = '',
    comentario_viento: str       = '',
    comentario_quema:  str       = '',
    nombre_punto:      str       = '',
    logo_path:         str|None  = None,
    output_dir:        str|None  = None,
    zoom_mapa:         int       = 11,
) -> str:
    """
    Genera el PDF del reporte HYSPLIT y retorna su ruta absoluta.

    Parámetros obligatorios
    -----------------------
    lat, lon    : Coordenadas del punto de emisión.
    altura      : Altura de emisión en metros.
    kmz_url     : URL pública del KMZ generado por NOAA HYSPLIT.

    Parámetros opcionales
    ---------------------
    fecha_str          : Texto de fecha visible ('05/05/2026'). Default: hoy.
    comentario_viento  : Análisis de condiciones de viento (texto libre).
    comentario_quema   : Evaluación para la quema (texto libre).
    nombre_punto       : Nombre del lugar (para el nombre del archivo).
    logo_path          : Ruta a PNG/JPG del logo corporativo.
    output_dir         : Carpeta de salida. Default: directorio actual.
    zoom_mapa          : Zoom inicial del mapa folium (default: 11).

    Retorna
    -------
    str — ruta absoluta del PDF generado.
    """
    fecha_str  = fecha_str  or datetime.now().strftime('%d de %B de %Y')
    output_dir = output_dir or os.getcwd()
    os.makedirs(output_dir, exist_ok=True)

    slug     = (nombre_punto or f'{lat}_{lon}').replace(' ', '_').replace(',', '').strip('_')
    ts       = datetime.now().strftime('%Y%m%d_%H%M%S')
    pdf_path = os.path.join(output_dir, f'RDCFT_Humo_{slug}_{ts}.pdf')

    with tempfile.TemporaryDirectory() as tmp:
        print('[PDF] Capturando mapa satelital…')
        map_img = _capturar_mapa(lat, lon, zoom=zoom_mapa, tmp_dir=tmp)

        print('[PDF] Ensamblando documento…')
        _ensamblar_pdf(
            pdf_path=pdf_path,
            lat=lat, lon=lon, altura=altura,
            kmz_url=kmz_url, fecha_str=fecha_str,
            map_img=map_img,
            cv=comentario_viento,
            cq=comentario_quema,
            nombre=nombre_punto,
            logo_path=logo_path,
        )

    print(f'[PDF] ✅ Generado → {pdf_path}')
    return pdf_path


# ══════════════════════════════════════════════════════════════════════
# Ejecución directa para pruebas
# ══════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    ruta = generar_pdf(
        lat=-37.4500,
        lon=-73.3500,
        altura=500,
        kmz_url='https://www.ready.noaa.gov/hypub-bin/trajresults.pl?jobidno=123456',
        nombre_punto='Predio Ejemplo',
        comentario_viento=(
            'Viento promedio 12 km/h desde el SO. '
            'Rachas máximas de 28 km/h al mediodía. '
            'Dirección predominante 220°. Dentro del límite operacional.'
        ),
        comentario_quema=(
            'Condiciones FAVORABLES. HR 65%. Temperatura 18°C. '
            'Sin inversión térmica. Operación autorizada con supervisión.'
        ),
    )
    print(f'Archivo: {ruta}')
