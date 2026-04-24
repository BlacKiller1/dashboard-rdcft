#!/usr/bin/env python3
"""
descargar_precipitaciones.py
Descarga precipitaciones desde la API JSON de agrometeorologia.cl.
No requiere Selenium ni formularios — usa GET directo a la API.

Instalación:
    pip install requests

Uso:
    python scripts/descargar_precipitaciones.py
"""

import os, json, time, requests
from datetime import datetime, timedelta

# ═══════════════════════════════════════════════════════════════════
#  API de agrometeorologia.cl
#  La URL base del JSON con todas las estaciones y sus precipitaciones
# ═══════════════════════════════════════════════════════════════════
# Esta URL devuelve todas las estaciones con STACK-DAY (precipitación diaria)
# El timestamp _= es solo un cache-buster, puede ser cualquier número
API_URL = "https://agrometeorologia.cl/json/tmp_667249736/items-pp.json"

# ═══════════════════════════════════════════════════════════════════
#  MAPEO estación → paisaje
# ═══════════════════════════════════════════════════════════════════
ESTACION_PAISAJE = {
    "Carrizal":        "Lomas de Quivolgo",
    "Curepto":         "Secanos del Mataquito",
    "Cuyuname":        "Ruiles de la Costa Maulina",
    "El Auquil":       "Cordillera del Maule",
    "Hualañé":         "Valle de Cauquenes",
    "Cauquenes":       "Valle de Cauquenes",
    "Palhuen":         "Secanos del Mataquito",
    "Santa Estela":    "Ruiles de la Costa Maulina",
    "Talca":           "Cordillera del Maule",
    "Vivero Quivolgo": "Lomas de Quivolgo",
    "Bandurrias":      "Secanos del Ñuble",
    "Coyanco":         "Valle del Itata",
    "El Espolón":      "Secanos del Ñuble",
    "Quilamapu":       "Secanos del Ñuble",
    "El Kayser":       "Cordillera de Huemules",
    "Human":           "Canteras del Laja",
    "Remolinos":       "Arenales de Cholguán",
    "Siberia":         "Arenales de Cholguán",
    "Yungay":          "Arenales de Cholguán",
    "Totoral":         "Costa de Queules",
    "Zorzal Blanco":   "Costa de Queules",
    "Puralihue":       "Costa de Queules",
    "Cangrejillo":     "Robles de Coyanmahuida",
    "Concepción":      "Robles de Coyanmahuida",
    "Nueva Aldea":     "Valle del Itata",
    "Portezuelo":      "Valle del Itata",
    "La Colcha":       "Cuenca de Curanilahue",
    "Las Puentes":     "Golfo de Arauco",
    "Lebu":            "Costa Leufú",
    "Llanquehue":      "Cumbres de Nahuelbuta",
    "Santa Juana":     "Biobio Sur",
    "Tanahullin":      "Biobio Sur",
    "Baltimore":       "Malleco",
    "Santa Amelia":    "Malleco",
    "Llongo":          "Bosque Valdiviano",
    "Pancul":          "Bosque Valdiviano",
    "Oldenburgo":      "Río Bueno",
    "La Paz":          "Valle del Rucapillán",
    "Maquehue":        "Valle del Rucapillán",
    "Liceo Agrotec":   "Río Bueno",
    "Copihue":         "Río Bueno",
}

# Estaciones Arauco que nos interesan (nombre como aparece en la API)
ESTACIONES_ARAUCO = set(ESTACION_PAISAJE.keys())

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Referer":         "https://agrometeorologia.cl/PP",
    "Accept":          "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
}

def calcular_fechas():
    """Retorna las fechas de los 7 días anteriores al lunes actual"""
    hoy  = datetime.now()
    dias = (hoy.weekday() + 1) % 7
    dom  = hoy - timedelta(days=dias if dias > 0 else 7)
    lun  = dom - timedelta(days=6)
    return lun.strftime("%Y-%m-%d"), dom.strftime("%Y-%m-%d")

def es_fecha_valida(fecha_str):
    """Verifica que sea una fecha real (YYYY-MM-DD), no 'ayer', 'hoy', etc."""
    try:
        datetime.strptime(fecha_str, "%Y-%m-%d")
        return True
    except:
        return False

def obtener_url_api(session):
    """
    Obtiene la URL correcta del JSON haciendo POST al formulario primero.
    Así obtenemos el tmp_XXXXXXX correcto de la sesión actual.
    """
    try:
        # Primero hacer la consulta para generar el tmp correcto
        data = [
            ("estaciones[]", "EXT-1003"),  # Carrizal como prueba
            ("variables[]",  "PP_ACUM"),
            ("tiempo",       "dia"),
            ("fecha_inicio", "13-04-2026"),
            ("fecha_fin",    "19-04-2026"),
            ("tipo_archivo", "excel"),
        ]
        r = session.post(
            "https://agrometeorologia.cl/consultar",
            data=data,
            headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded",
                     "Referer": "https://agrometeorologia.cl/PP_DIA"},
            timeout=30,
        )
        # Extraer el tmp_XXXXXXX de la respuesta
        import re
        m = re.search(r'/json/(tmp_\d+)/items', r.text)
        if m:
            tmp = m.group(1)
            url = f"https://agrometeorologia.cl/json/{tmp}/items-pp.json"
            print(f"  URL API: {url}")
            return url
    except Exception as e:
        print(f"  ⚠ No se pudo obtener URL dinámica: {e}")

    # Fallback: usar la URL conocida
    return API_URL

def descargar_datos(session, url_api, f_ini, f_fin):
    """
    Descarga el JSON completo y filtra las estaciones Arauco
    con precipitaciones en el rango de fechas solicitado.
    """
    ts = int(datetime.now().timestamp() * 1000)
    try:
        r = session.get(
            f"{url_api}?_={ts}",
            headers=HEADERS,
            timeout=60
        )
        r.raise_for_status()
        estaciones_json = r.json()
        print(f"  Total estaciones en API: {len(estaciones_json)}")
        return estaciones_json
    except Exception as e:
        print(f"  ✗ Error descargando JSON: {e}")
        return []

def procesar_datos(estaciones_json, f_ini, f_fin):
    """Filtra y procesa las estaciones Arauco del JSON"""
    todos_datos = {}
    fecha_ini   = datetime.strptime(f_ini, "%Y-%m-%d")
    fecha_fin   = datetime.strptime(f_fin, "%Y-%m-%d")

    for est in estaciones_json:
        nombre = est.get("nombre", "").strip()

        # Verificar si es una estación que nos interesa
        paisaje = None
        for key in ESTACIONES_ARAUCO:
            if key.lower() in nombre.lower() or nombre.lower() in key.lower():
                paisaje = ESTACION_PAISAJE[key]
                break
        if not paisaje:
            continue

        # Extraer precipitaciones diarias del rango solicitado
        stack = est.get("STACK-DAY", {})
        datos_est = {}
        for fecha_str, vals in stack.items():
            if not es_fecha_valida(fecha_str):
                continue
            fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d")
            if fecha_ini <= fecha_obj <= fecha_fin:
                pp = vals.get("PP-SUM", None)
                try:
                    datos_est[fecha_str] = round(float(pp), 1) if pp is not None else None
                except:
                    datos_est[fecha_str] = None

        if datos_est:
            todos_datos[nombre] = datos_est
            print(f"    ✓ {nombre} ({paisaje}): {len(datos_est)} días")

    return todos_datos

def main():
    f_ini, f_fin = calcular_fechas()
    print(f"\n{'='*55}")
    print(f"  Dashboard RDCFT — Descarga Precipitaciones")
    print(f"  Período: {f_ini} → {f_fin}")
    print(f"{'='*55}\n")

    session = requests.Session()

    # Obtener URL correcta de la API
    print("Conectando con agrometeorologia.cl...")
    url_api = obtener_url_api(session)

    # Descargar JSON completo
    print("\nDescargando datos...")
    estaciones_json = descargar_datos(session, url_api, f_ini, f_fin)

    if not estaciones_json:
        print("✗ No se obtuvieron datos")
        return

    # Procesar y filtrar estaciones Arauco
    print("\nFiltrando estaciones Arauco:")
    todos_datos = procesar_datos(estaciones_json, f_ini, f_fin)

    # Agrupar por paisaje
    por_paisaje = {}
    for est, dias in todos_datos.items():
        paisaje = next((p for n, p in ESTACION_PAISAJE.items()
                        if n.lower() in est.lower() or est.lower() in n.lower()), None)
        if paisaje:
            por_paisaje.setdefault(paisaje, {})[est] = dias

    # Guardar JSON
    os.makedirs("data", exist_ok=True)
    resultado = {
        "generado":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "periodo":     {"inicio": f_ini, "fin": f_fin},
        "estaciones":  todos_datos,
        "por_paisaje": por_paisaje,
    }
    with open("data/precipitaciones.json", "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*55}")
    print(f"  ✅ Completado")
    print(f"  Estaciones: {len(todos_datos)}")
    print(f"  Paisajes:   {len(por_paisaje)}")
    print(f"  Archivo:    data/precipitaciones.json")
    print(f"{'='*55}\n")

if __name__ == "__main__":
    main()