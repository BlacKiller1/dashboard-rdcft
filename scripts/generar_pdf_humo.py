#!/usr/bin/env python3
"""
generar_pdf_humo.py
═══════════════════
Genera un reporte PDF profesional (Carta Horizontal, 792×612 pt) para
simulaciones de dispersión de humo NOAA HYSPLIT.

Dependencias:
    pip install reportlab pillow folium selenium webdriver-manager

Uso como módulo:
    from scripts.generar_pdf_humo import generar_pdf

    ruta = generar_pdf(
        lat=-37.45, lon=-73.35, altura=500,
        kmz_url='https://www.ready.noaa.gov/...',
        fecha_str='05/05/2026',
        comentario_viento='Viento SO 12 km/h.',
        comentario_quema='Condiciones favorables.',
        nombre_punto='Predio San Pedro',
    )
"""

from __future__ import annotations

import os
import time
import tempfile
from datetime import datetime
from pathlib import Path

# ── Selenium / webdriver-manager (opcional pero recomendado) ───────────
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
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib.utils import ImageReader


# ══════════════════════════════════════════════════════════════════════
# Paleta de diseño
# ══════════════════════════════════════════════════════════════════════
C_HEAD1  = colors.HexColor('#2C3E50')   # cabecera principal
C_HEAD2  = colors.HexColor('#34495E')   # cabecera secundaria
C_BG     = colors.HexColor('#F4F6F7')   # fondo celda datos
C_BG_LBL = colors.HexColor('#E8EDF0')   # fondo sub-etiqueta
C_BORDER = colors.HexColor('#BDC3C7')   # borde tabla
C_TEXT   = colors.HexColor('#2C3E50')   # texto principal
C_GRAY   = colors.HexColor('#7F8C8D')   # texto secundario
C_LINK   = colors.HexColor('#2980B9')   # enlace KMZ
C_ACCENT = colors.HexColor('#E8820A')   # naranja Arauco
C_WHITE  = colors.white
C_FOOTER = colors.HexColor('#EAE8E4')


# ══════════════════════════════════════════════════════════════════════
# 1. Captura satelital del mapa
# ══════════════════════════════════════════════════════════════════════

def _capturar_mapa(lat: float, lon: float, zoom: int, tmp_dir: str) -> str | None:
    """
    Genera mapa folium con tiles Esri World Imagery y lo captura con
    Selenium headless a 1920×1080. Retorna ruta del PNG o None si falla.
    """
    if not _FOLIUM_OK or not _SELENIUM_OK:
        print('[PDF] ⚠ folium o selenium no disponibles — se usará mapa placeholder.')
        return None

    html_path = os.path.join(tmp_dir, '_mapa.html')
    img_path  = os.path.join(tmp_dir, '_mapa.png')

    # ── Mapa folium ──────────────────────────────────────────────────
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

    # Ícono de fuego
    folium.Marker(
        location=[lat, lon],
        icon=folium.DivIcon(
            html=(
                '<div style="font-size:30px;line-height:1;'
                'filter:drop-shadow(0 0 8px rgba(255,60,0,.95));'
                'margin-top:-30px;margin-left:-15px;">🔥</div>'
            ),
            icon_size=(30, 30),
            icon_anchor=(15, 30),
        ),
    ).add_to(m)

    # Círculo de referencia naranja
    folium.CircleMarker(
        location=[lat, lon],
        radius=16, color='#FF3300', fill=False, weight=2.5, opacity=0.9,
    ).add_to(m)

    m.save(html_path)

    # ── Selenium headless Chrome ─────────────────────────────────────
    opts = ChromeOptions()
    opts.add_argument('--headless=new')
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--disable-gpu')
    opts.add_argument('--window-size=1920,1080')
    opts.add_argument('--hide-scrollbars')

    try:
        if _WDM:
            driver = webdriver.Chrome(
                service=ChromeService(ChromeDriverManager().install()),
                options=opts,
            )
        else:
            driver = webdriver.Chrome(options=opts)

        try:
            driver.get(Path(html_path).as_uri())
            time.sleep(4)   # esperar que los tiles satelitales carguen
            driver.save_screenshot(img_path)
        finally:
            driver.quit()

        return img_path

    except Exception as e:
        print(f'[PDF] ⚠ Error capturando mapa: {e}')
        return None


# ══════════════════════════════════════════════════════════════════════
# 2. Helpers de estilo para tablas
# ══════════════════════════════════════════════════════════════════════

def _p(text: str, size: float = 8, color=None, bold: bool = False,
       leading: float = None) -> Paragraph:
    """Paragraph simple. Escapa HTML y convierte \\n → <br/>."""
    clr   = color or C_TEXT
    ld    = leading or (size + 4)
    font  = 'Helvetica-Bold' if bold else 'Helvetica'
    style = ParagraphStyle(
        'cell',
        fontName=font, fontSize=size, textColor=clr,
        leading=ld, spaceAfter=0, spaceBefore=0,
    )
    safe = (text or '')
    safe = safe.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    safe = safe.replace('\n', '<br/>')
    return Paragraph(safe, style)


def _estilo_base() -> list:
    """Estilo TableStyle base para todas las tablas."""
    return [
        # Cabecera (fila 0)
        ('BACKGROUND',    (0, 0), (-1, 0), C_HEAD1),
        ('TEXTCOLOR',     (0, 0), (-1, 0), C_WHITE),
        ('FONTNAME',      (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',      (0, 0), (-1, 0), 8),
        ('TOPPADDING',    (0, 0), (-1, 0), 7),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
        ('LEFTPADDING',   (0, 0), (-1, 0), 9),
        ('RIGHTPADDING',  (0, 0), (-1, 0), 9),
        # Datos (filas 1+)
        ('BACKGROUND',    (0, 1), (-1, -1), C_BG),
        ('TOPPADDING',    (0, 1), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 5),
        ('LEFTPADDING',   (0, 1), (-1, -1), 9),
        ('RIGHTPADDING',  (0, 1), (-1, -1), 9),
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        # Bordes
        ('GRID', (0, 0), (-1, -1), 0.5, C_BORDER),
        ('BOX',  (0, 0), (-1, -1), 1.2, C_HEAD1),
    ]


# ══════════════════════════════════════════════════════════════════════
# 3. Construcción de los tres bloques de información
# ══════════════════════════════════════════════════════════════════════

def _bloque_emision(lat: float, lon: float, col_w: float) -> Table:
    """Bloque 1 — PUNTO DE EMISIÓN."""
    data = [
        [_p('PUNTO DE EMISIÓN', 8, C_WHITE, bold=True)],
        [_p('Latitud',          7, C_GRAY,  bold=True)],
        [_p(f'{lat:.6f}°',     11, C_TEXT)],
        [_p('Longitud',         7, C_GRAY,  bold=True)],
        [_p(f'{lon:.6f}°',     11, C_TEXT)],
    ]
    st = _estilo_base()
    st += [
        ('BACKGROUND',    (0, 1), (-1, 1), C_BG_LBL),
        ('BACKGROUND',    (0, 3), (-1, 3), C_BG_LBL),
        ('TOPPADDING',    (0, 1), (-1, 1), 3),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 2),
        ('TOPPADDING',    (0, 3), (-1, 3), 3),
        ('BOTTOMPADDING', (0, 3), (-1, 3), 2),
    ]
    t = Table(data, colWidths=[col_w])
    t.setStyle(TableStyle(st))
    return t


def _bloque_condiciones(altura: int, coment_viento: str,
                        coment_quema: str, col_w: float) -> Table:
    """Bloque 2 — CONDICIONES DE VIENTO + CONDICIONES PARA LA QUEMA."""
    cv = coment_viento or 'No especificado.'
    cq = coment_quema  or 'No especificado.'
    data = [
        [_p('CONDICIONES DE VIENTO',       8,   C_WHITE, bold=True)],
        [_p(f'Altura de emisión: {altura} m', 8.5, C_TEXT,  bold=True)],
        [_p(cv,                            7.5, C_TEXT)],
        [_p('CONDICIONES PARA LA QUEMA',   8,   C_WHITE, bold=True)],
        [_p(cq,                            7.5, C_TEXT)],
    ]
    st = _estilo_base()
    st += [
        ('BACKGROUND',    (0, 3), (-1, 3), C_HEAD2),
        ('TEXTCOLOR',     (0, 3), (-1, 3), C_WHITE),
        ('FONTNAME',      (0, 3), (-1, 3), 'Helvetica-Bold'),
        ('TOPPADDING',    (0, 3), (-1, 3), 7),
        ('BOTTOMPADDING', (0, 3), (-1, 3), 7),
    ]
    t = Table(data, colWidths=[col_w])
    t.setStyle(TableStyle(st))
    return t


def _bloque_trayectoria(kmz_url: str, col_w: float) -> Table:
    """Bloque 3 — TRAYECTORIA HYSPLIT + enlace KMZ."""
    url_display = kmz_url if len(kmz_url) < 72 else kmz_url[:69] + '…'
    data = [
        [_p('TRAYECTORIA HYSPLIT',                               8,   C_WHITE, bold=True)],
        [_p('Modelo: HYSPLIT Ensemble',                          8.5, C_TEXT,  bold=True)],
        [_p('Fuente: NOAA ARL  ·  GFS Global',                  7.5, C_GRAY)],
        [_p('Archivo KMZ disponible para\nvisualización en Google Earth:', 7.5, C_TEXT)],
        [_p(url_display,                                          6.5, C_LINK)],
    ]
    st = _estilo_base()
    st += [
        ('TEXTCOLOR', (0, 4), (-1, 4), C_LINK),
        ('FONTNAME',  (0, 4), (-1, 4), 'Helvetica-Oblique'),
    ]
    t = Table(data, colWidths=[col_w])
    t.setStyle(TableStyle(st))
    return t


# ══════════════════════════════════════════════════════════════════════
# 4. Ensamblaje del PDF con canvas directo
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

    pW, pH = landscape(letter)   # 792 × 612 pt
    M   = 18.0                   # margen exterior
    GAP =  6.0                   # hueco entre zonas

    # ── Distribución vertical (origen = borde inferior de página) ─────
    #
    #   pH=612 ┌─────────────────────┐  pH - M  = 594
    #          │     MAPA            │
    #   MAP_BOT┼─────────────────────┼  225
    #   DIV_Y  │  ─── divisor ───    │  219
    #   TABLE  │  bloque1│blo2│blo3  │  48 → 213
    #   FOOTER ├─────────────────────┤  42
    #       0  └─────────────────────┘
    #
    FOOTER_H  = 42.0
    TABLE_H   = 165.0
    TABLE_BOT = FOOTER_H + GAP           # 48
    TABLE_TOP = TABLE_BOT + TABLE_H      # 213
    DIV_Y     = TABLE_TOP + GAP          # 219
    MAP_BOT   = DIV_Y + GAP              # 225
    MAP_H     = pH - M - MAP_BOT         # ≈ 369

    c = Canvas(pdf_path, pagesize=(pW, pH))
    c.setFillColor(C_WHITE)
    c.rect(0, 0, pW, pH, fill=1, stroke=0)

    # ── 1. Imagen del mapa ────────────────────────────────────────────
    avail_w = pW - 2 * M   # 756 pt
    if map_img and os.path.exists(map_img):
        ir     = ImageReader(map_img)
        iw, ih = ir.getSize()
        scale  = min(avail_w / iw, MAP_H / ih)
        dw, dh = iw * scale, ih * scale
        ix     = M + (avail_w - dw) / 2
        iy     = MAP_BOT

        c.drawImage(map_img, ix, iy, dw, dh,
                    preserveAspectRatio=True, mask='auto')
        c.setStrokeColor(C_BORDER)
        c.setLineWidth(0.7)
        c.rect(ix, iy, dw, dh, fill=0, stroke=1)
    else:
        # Placeholder cuando selenium/folium no están disponibles
        dw, dh = avail_w, MAP_H
        ix, iy = M, MAP_BOT
        c.setFillColor(colors.HexColor('#2A2A2A'))
        c.rect(ix, iy, dw, dh, fill=1, stroke=0)
        c.setFillColor(colors.HexColor('#555555'))
        c.setFont('Helvetica', 11)
        c.drawCentredString(pW / 2, iy + dh / 2 + 8, 'Mapa satelital no disponible')
        c.setFont('Helvetica', 9)
        c.setFillColor(colors.HexColor('#888888'))
        c.drawCentredString(pW / 2, iy + dh / 2 - 8, f'Lat {lat:.6f}  ·  Lon {lon:.6f}')

    # ── 2. Logo corporativo (esquina superior izquierda del mapa) ──────
    LOGO_W, LOGO_H = 110, 35
    lx = ix + 8
    ly = iy + dh - LOGO_H - 8

    if logo_path and os.path.exists(logo_path):
        c.drawImage(logo_path, lx, ly, LOGO_W, LOGO_H,
                    preserveAspectRatio=True, mask='auto')
    else:
        # Placeholder Arauco
        c.setFillColor(colors.HexColor('#1A252F'))
        c.setStrokeColor(C_WHITE)
        c.setLineWidth(0.8)
        c.roundRect(lx, ly, LOGO_W, LOGO_H, 5, fill=1, stroke=1)
        c.setFillColor(C_WHITE)
        c.setFont('Helvetica-Bold', 14)
        c.drawCentredString(lx + LOGO_W / 2, ly + LOGO_H / 2 + 2, 'ARAUCO')
        c.setFillColor(colors.HexColor('#95A5A6'))
        c.setFont('Helvetica', 6.5)
        c.drawCentredString(lx + LOGO_W / 2, ly + 9, 'GESTIÓN FORESTAL')

    # ── 3. Línea divisoria ────────────────────────────────────────────
    c.setStrokeColor(C_HEAD1)
    c.setLineWidth(1.5)
    c.line(M, DIV_Y, pW - M, DIV_Y)

    # ── 4. Tres tablas de información ─────────────────────────────────
    COL_GAP = 10.0
    col_w   = (avail_w - 2 * COL_GAP) / 3   # ≈ 245 pt cada una

    bloques = [
        _bloque_emision(lat, lon, col_w),
        _bloque_condiciones(altura, cv, cq, col_w),
        _bloque_trayectoria(kmz_url, col_w),
    ]

    for i, tbl in enumerate(bloques):
        x    = M + i * (col_w + COL_GAP)
        _, h = tbl.wrapOn(c, col_w, TABLE_H)
        # Alinear la parte superior de cada tabla al borde superior de la zona
        tbl.drawOn(c, x, TABLE_TOP - h)

    # ── 5. Footer ─────────────────────────────────────────────────────
    # Fondo
    c.setFillColor(C_FOOTER)
    c.rect(0, 0, pW, FOOTER_H, fill=1, stroke=0)

    # Línea superior
    c.setStrokeColor(C_HEAD1)
    c.setLineWidth(1.0)
    c.line(M, FOOTER_H, pW - M, FOOTER_H)

    # Barra de acento naranja (borde izquierdo)
    c.setFillColor(C_ACCENT)
    c.rect(0, 0, 5, FOOTER_H, fill=1, stroke=0)

    # Título principal centrado
    nombre_display = nombre or f'Lat {lat:.4f}  ·  Lon {lon:.4f}'
    c.setFillColor(C_TEXT)
    c.setFont('Helvetica-Bold', 11)
    c.drawCentredString(pW / 2, FOOTER_H / 2 + 8,
                        f'Simulación de Dispersión de Humo  —  {nombre_display}')

    # Subtítulo centrado
    c.setFillColor(C_GRAY)
    c.setFont('Helvetica', 7.5)
    c.drawCentredString(pW / 2, FOOTER_H / 2 - 5,
                        f'HYSPLIT Ensemble  |  Model NOAA GFS  |  {fecha_str}')

    # Marca derecha
    c.setFillColor(colors.HexColor('#BBBBBB'))
    c.setFont('Helvetica', 7)
    c.drawRightString(pW - M, 8, 'RDCFT · Arauco')

    c.save()


# ══════════════════════════════════════════════════════════════════════
# 5. API pública
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
    zoom_mapa:         int       = 10,
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
    fecha_str          : Fecha a mostrar ('05/05/2026'). Default: hoy.
    comentario_viento  : Texto libre sobre condiciones de viento.
    comentario_quema   : Texto libre sobre condiciones para la quema.
    nombre_punto       : Nombre del lugar (pie de página + nombre de archivo).
    logo_path          : Ruta a PNG/JPG del logo corporativo.
    output_dir         : Carpeta de salida. Default: directorio de trabajo actual.
    zoom_mapa          : Zoom inicial del mapa folium (default: 10).

    Retorna
    -------
    str — ruta absoluta del PDF generado.
    """
    fecha_str  = fecha_str  or datetime.now().strftime('%d/%m/%Y')
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
        nombre_punto='Predio Ejemplo Arauco',
        comentario_viento=(
            'Viento promedio 12 km/h desde el SO. '
            'Rachas máximas de 28 km/h registradas al mediodía. '
            'Dirección predominante 220°. Dentro del límite operacional.'
        ),
        comentario_quema=(
            'Condiciones generales FAVORABLES. '
            'Humedad relativa 65%. Temperatura 18°C. '
            'Sin inversión térmica detectada. Operación autorizada con supervisión.'
        ),
    )
    print(f'Archivo: {ruta}')
