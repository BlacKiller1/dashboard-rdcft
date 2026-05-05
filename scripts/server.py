"""
server.py  —  API backend para Simulación de Humo HYSPLIT
Arrancar con:  python scripts/server.py

Requiere:
    pip install flask flask-cors selenium
    ChromeDriver instalado y en el PATH
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify
from flask_cors import CORS
from robot_noaa import obtener_kmz_ensemble

app = Flask(__name__)
CORS(app)  # permite peticiones desde el dashboard local


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

    if url:
        print(f"[HUMO] ✅ KMZ listo: {url}")
        return jsonify({'url': url})
    else:
        print("[HUMO] ❌ La simulación no retornó URL.")
        return jsonify({'error': 'La simulación falló o el servidor NOAA no respondió.'}), 500


if __name__ == '__main__':
    print("=" * 55)
    print("  Servidor Simulación de Humo HYSPLIT")
    print("  Escuchando en http://localhost:5001")
    print("=" * 55)
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)
