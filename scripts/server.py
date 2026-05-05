"""
server.py  —  API backend para Simulación de Humo HYSPLIT
Local:    python scripts/server.py          (puerto 5001)
Nube:     Railway/Render leen PORT del entorno automáticamente
"""

import sys
import os

# Garantiza que robot_noaa.py sea encontrable tanto con `python scripts/server.py`
# como con `gunicorn scripts.server:app` desde /app
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

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
    port = int(os.environ.get('PORT', 5001))
    print("=" * 55)
    print(f"  Servidor Simulación de Humo HYSPLIT")
    print(f"  Escuchando en http://0.0.0.0:{port}")
    print("=" * 55)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
