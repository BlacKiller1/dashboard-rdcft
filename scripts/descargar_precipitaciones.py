#!/usr/bin/env python3
"""
descargar_precipitaciones.py
Descarga precipitaciones acumuladas de los últimos 7 días
desde agrometeorologia.cl para todas las estaciones Arauco.
Se ejecuta automáticamente cada lunes a las 00:30 via GitHub Actions.
"""

import requests
import json
import os
from datetime import datetime, timedelta
from io import StringIO

# ═══════════════════════════════════════════════════════════════════
#  ESTACIONES ARAUCO agrupadas en grupos de 5 (límite del sitio)
# ═══════════════════════════════════════════════════════════════════
GRUPOS_ESTACIONES = [
    ["Carrizal", "Curepto", "Cuyuname", "El Auquil", "Hualañé"],
    ["Palhuen", "Santa Estela", "Vivero Quivolgo", "Teno", "Bandurrias"],
    ["Coyanco", "El Espolón", "El Kayser", "Litral", "Remolinos"],
    ["Siberia", "Totoral", "Zorzal Blanco", "Cangrejillo", "La Colcha"],
    ["Las Puentes", "Los Alamos", "Santa Juana", "Tanahullin", "Baltimore"],
    ["Santa Amelia", "Llongo", "Oldenburgo", "Pancul"],
]

# ═══════════════════════════════════════════════════════════════════
#  Mapeo estación → paisaje (para mostrar en el dashboard)
# ═══════════════════════════════════════════════════════════════════
ESTACION_PAISAJE = {
    "Carrizal":        "Cordillera del Maule",
    "Curepto":         "Lomas de Quivolgo",
    "Cuyuname":        "Ruiles de la Costa Maulina",
    "El Auquil":       "Secanos del Mataquito",
    "Hualañé":         "Valle de Cauquenes",
    "Palhuen":         "Arenales de Cholguán",
    "Santa Estela":    "Cordillera del Maule",
    "Vivero Quivolgo": "Lomas de Quivolgo",
    "Teno":            "Secanos del Mataquito",
    "Bandurrias":      "Secanos del Ñuble",
    "Coyanco":         "Secanos del Ñuble",
    "El Espolón":      "Canteras del Laja",
    "El Kayser":       "Canteras del Laja",
    "Litral":          "Arenales de Cholguán",
    "Remolinos":       "Arenales de Cholguán",
    "Siberia":         "Cordillera de Huemules",
    "Totoral":         "Valle del Itata",
    "Zorzal Blanco":   "Robles de Coyanmahuida",
    "Cangrejillo":     "Biobio Sur",
    "La Colcha":       "Cuenca de Curanilahue",
    "Las Puentes":     "Golfo de Arauco",
    "Los Alamos":      "Costa Leufú",
    "Santa Juana":     "Secanos del Ñuble",
    "Tanahullin":      "Biobio Sur",
    "Baltimore":       "Malleco",
    "Santa Amelia":    "Malleco",
    "Llongo":          "Bosque Valdiviano",
    "Oldenburgo":      "Río Bueno",
    "Pancul":          "Río Bueno",
}

def calcular_fechas():
    """
    Calcula rango de 7 días anteriores al lunes actual.
    Lunes 28 abril → rango: lunes 21 abril al domingo 27 abril
    """
    hoy = datetime.now()
    dias_hasta_domingo = (hoy.weekday() + 1) % 7
    domingo = hoy - timedelta(days=dias_hasta_domingo if dias_hasta_domingo > 0 else 7)
    lunes = domingo - timedelta(days=6)
    return lunes.strftime("%Y-%m-%d"), domingo.strftime("%Y-%m-%d")

def parsear_csv(texto, estaciones):
    """Parsea el texto CSV descargado y retorna {estacion: {fecha: mm}}"""
    resultado = {est: {} for est in estaciones}
    lines = texto.strip().split("\n")

    # Buscar línea de encabezados
    header_idx = None
    for i, line in enumerate(lines):
        if "Tiempo" in line or any(est in line for est in estaciones):
            header_idx = i
            break

    if header_idx is None:
        return resultado

    headers = [h.strip() for h in lines[header_idx].split("\t")]

    # Mapear estaciones a índices de columna
    col_map = {}
    for j, h in enumerate(headers):
        if h in estaciones:
            col_map[h] = j

    # Parsear filas de datos
    for line in lines[header_idx + 1:]:
        if not line.strip() or "uso de los datos" in line or "Descargar" in line:
            continue
        cols = line.split("\t")
        if len(cols) < 2:
            continue

        # Normalizar fecha a YYYY-MM-DD
        fecha_raw = cols[0].strip()
        try:
            partes = fecha_raw.split("-")
            if len(partes) == 3 and len(partes[0]) == 2:
                fecha = f"{partes[2]}-{partes[1]}-{partes[0]}"
            else:
                fecha = fecha_raw
        except:
            continue

        for est, idx in col_map.items():
            if idx < len(cols):
                try:
                    resultado[est][fecha] = round(float(cols[idx].strip()), 1)
                except:
                    resultado[est][fecha] = None

    return resultado

def descargar_grupo(estaciones, fecha_inicio, fecha_fin):
    """Descarga datos para un grupo de estaciones via formulario web"""
    # La URL de descarga del sitio (basada en el patrón observado)
    url = "https://agrometeorologia.cl/datos/PP_DIA"

    # Parámetros del formulario
    payload = {
        "startDate": fecha_inicio,
        "endDate":   fecha_fin,
        "format":    "csv",
    }
    for est in estaciones:
        payload.setdefault("stations[]", []).append(est)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer":    "https://agrometeorologia.cl/PP_DIA",
    }

    try:
        resp = requests.post(url, data=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        return parsear_csv(resp.text, estaciones)
    except Exception as e:
        print(f"    ✗ Error: {e}")
        return {est: {} for est in estaciones}

def main():
    fecha_inicio, fecha_fin = calcular_fechas()
    print(f"Período: {fecha_inicio} → {fecha_fin}")

    todos_datos = {}

    for i, grupo in enumerate(GRUPOS_ESTACIONES, 1):
        print(f"Grupo {i}/{len(GRUPOS_ESTACIONES)}: {', '.join(grupo)}")
        datos = descargar_grupo(grupo, fecha_inicio, fecha_fin)
        todos_datos.update(datos)

    # Agrupar por paisaje
    por_paisaje = {}
    for est, dias in todos_datos.items():
        paisaje = ESTACION_PAISAJE.get(est)
        if not paisaje:
            continue
        if paisaje not in por_paisaje:
            por_paisaje[paisaje] = {}
        if est not in por_paisaje[paisaje]:
            por_paisaje[paisaje][est] = dias

    # JSON final
    resultado = {
        "generado":  datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "periodo":   {"inicio": fecha_inicio, "fin": fecha_fin},
        "estaciones": todos_datos,
        "por_paisaje": por_paisaje
    }

    os.makedirs("data", exist_ok=True)
    with open("data/precipitaciones.json", "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"Guardado en data/precipitaciones.json ({len(todos_datos)} estaciones)")

if __name__ == "__main__":
    main()
