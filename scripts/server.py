"""
server.py  —  API backend para Simulación de Humo HYSPLIT
Local:    python scripts/server.py          (puerto 5001)
Nube:     Railway/Render leen PORT del entorno automáticamente
"""

import sys
import os
import zipfile
import io
import xml.etree.ElementTree as ET
from urllib.request import urlopen, Request

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from flask import Flask, request, jsonify
from flask_cors import CORS
from robot_noaa import obtener_kmz_ensemble

app = Flask(__name__)
CORS(app)

KML_NS = 'http://www.opengis.net/kml/2.2'


def kml_color_a_hex(kml_color):
    """Convierte color KML (AABBGGRR) a hex CSS (#RRGGBB)."""
    c = (kml_color or '').strip().lstrip('#')
    if len(c) == 8:
        return f'#{c[6:8]}{c[4:6]}{c[2:4]}'
    return '#FF8C00'


def kmz_a_geojson(kmz_url):
    """Descarga el KMZ de NOAA y extrae las trayectorias como GeoJSON."""
    try:
        req  = Request(kmz_url, headers={'User-Agent': 'Mozilla/5.0'})
        data = urlopen(req, timeout=30).read()

        with zipfile.ZipFile(io.BytesIO(data)) as z:
            kml_name = next((n for n in z.namelist() if n.endswith('.kml')), None)
            if not kml_name:
                return None
            kml_data = z.read(kml_name)

        root = ET.fromstring(kml_data)

        # Construir mapa id_style → color desde <StyleMap> / <Style>
        estilos = {}
        for style in root.iter(f'{{{KML_NS}}}Style'):
            sid = style.get('id', '')
            ls  = style.find(f'.//{{{KML_NS}}}LineStyle/{{{KML_NS}}}color')
            if sid and ls is not None and ls.text:
                estilos[sid] = kml_color_a_hex(ls.text)
        for smap in root.iter(f'{{{KML_NS}}}StyleMap'):
            sid  = smap.get('id', '')
            pair = smap.find(f'{{{KML_NS}}}Pair/{{{KML_NS}}}styleUrl')
            if sid and pair is not None and pair.text:
                ref = pair.text.lstrip('#')
                if ref in estilos:
                    estilos[sid] = estilos[ref]

        features = []
        for pm in root.iter(f'{{{KML_NS}}}Placemark'):
            ls = pm.find(f'.//{{{KML_NS}}}LineString')
            if ls is None:
                continue
            ctag = ls.find(f'{{{KML_NS}}}coordinates')
            if ctag is None or not ctag.text:
                continue

            coords = []
            for c in ctag.text.strip().split():
                parts = c.split(',')
                if len(parts) >= 2:
                    coords.append([float(parts[0]), float(parts[1])])

            if len(coords) < 2:
                continue

            # Resolver color del Placemark
            su = pm.find(f'{{{KML_NS}}}styleUrl')
            color = '#FF8C00'
            if su is not None and su.text:
                color = estilos.get(su.text.lstrip('#'), '#FF8C00')

            features.append({
                'type': 'Feature',
                'geometry': {'type': 'LineString', 'coordinates': coords},
                'properties': {'color': color}
            })

        print(f'[HUMO] KMZ parseado: {len(features)} trayectorias')
        return {'type': 'FeatureCollection', 'features': features}

    except Exception as e:
        print(f'[HUMO] No se pudo parsear KMZ: {e}')
        return None


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})


@app.route('/api/simular-humo', methods=['POST'])
def simular_humo():
    data = request.get_json(silent=True) or {}

    lat    = data.get('lat')
    lon    = data.get('lon')
    altura = data.get('altura', 500)

    if lat is None or lon is None:
        return jsonify({'error': 'Coordenadas requeridas (lat, lon)'}), 400

    try:
        lat    = float(lat)
        lon    = float(lon)
        altura = int(altura)
    except (ValueError, TypeError):
        return jsonify({'error': 'Valores de coordenadas inválidos'}), 400

    print(f"\n[HUMO] Simulación solicitada → lat={lat}, lon={lon}, altura={altura}m")
    url = obtener_kmz_ensemble(lat=lat, lon=lon, altura=altura)

    if not url:
        print("[HUMO] ❌ La simulación no retornó URL.")
        return jsonify({'error': 'La simulación falló o el servidor NOAA no respondió.'}), 500

    print(f"[HUMO] ✅ KMZ listo: {url}")
    respuesta = {'url': url}

    geojson = kmz_a_geojson(url)
    if geojson and geojson['features']:
        respuesta['trayectorias'] = geojson

    return jsonify(respuesta)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    print("=" * 55)
    print(f"  Servidor Simulación de Humo HYSPLIT")
    print(f"  Escuchando en http://0.0.0.0:{port}")
    print("=" * 55)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
