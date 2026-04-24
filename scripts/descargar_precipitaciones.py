#!/usr/bin/env python3
"""
descargar_precipitaciones.py
Descarga precipitaciones acumuladas de los últimos 7 días
desde agrometeorologia.cl usando Selenium (simula navegador real).

Ejecución manual:
    pip install selenium webdriver-manager pandas openpyxl
    python scripts/descargar_precipitaciones.py

Ejecución automática:
    GitHub Actions cada lunes a las 00:30
"""

import requests
import json
import os
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# ═══════════════════════════════════════════════════════════════════════
#  ESTACIONES — nombre exacto como aparece en agrometeorologia.cl
# ═══════════════════════════════════════════════════════════════════════
GRUPOS_ESTACIONES = [
    ["Carrizal, Constitución, ARAUCO",
     "Curepto, Curepto, ARAUCO",
     "Cuyuname, Empedrado, ARAUCO",
     "El Auquil, Pelarco, ARAUCO",
     "Hualañé, Hualañé, ARAUCO"],

    ["Palhuen, Curepto, ARAUCO",
     "Santa Estela, Constitución, ARAUCO",
     "Vivero Quivolgo, Constitución, ARAUCO",
     "Talca, Talca, INIA",
     "Cauquenes, Cauquenes, INIA"],

    ["Siberia, Yungay, ARAUCO",
     "Zorzal Blanco, Quirihue, ARAUCO",
     "Human, Yumbel, INIA",
     "El Kayser, Coihueco, ARAUCO",
     "El Espolón, Chillán, ARAUCO"],

    ["Totoral, Coelemu, ARAUCO",
     "Puralihue, Purén, INIA",
     "Cangrejillo, Florida, ARAUCO",
     "Quilamapu, Chillán, INIA",
     "Yungay, Yungay, ARAUCO"],

    ["Nueva Aldea, Ranquil, INIA",
     "Portezuelo, Portezuelo, INIA",
     "Coyanco, Quillón, ARAUCO",
     "Concepción, Concepción, INIA",
     "La Colcha, Curanilahue, ARAUCO"],

    ["Las Puentes, Arauco, INIA",
     "Lebu, Lebu, INIA",
     "Llanquehue, Llanquehue, INIA",
     "Santa Juana, Santa Juana, ARAUCO",
     "Tanahullin, Santa Juana, ARAUCO"],

    ["Baltimore, Collipulli, ARAUCO",
     "Santa Amelia, Collipulli, ARAUCO",
     "Llongo, Mariquina, ARAUCO",
     "Pancul, Los Lagos, ARAUCO",
     "Oldenburgo, La Unión, ARAUCO"],

    ["La Paz, Padre Las Casas, INIA",
     "Aeródromo Maquehue, Temuco, DMC",
     "Liceo Agrotec, Río Bueno, INIA",
     "El Copihue, Río Bueno, INIA"],
]

ESTACION_PAISAJE = {
    "Carrizal":           "Lomas de Quivolgo",
    "Curepto":            "Secanos del Mataquito",
    "Cuyuname":           "Ruiles de la Costa Maulina",
    "El Auquil":          "Cordillera del Maule",
    "Hualañé":            "Valle de Cauquenes",
    "Palhuen":            "Secanos del Mataquito",
    "Santa Estela":       "Ruiles de la Costa Maulina",
    "Vivero Quivolgo":    "Lomas de Quivolgo",
    "Talca":              "Cordillera del Maule",
    "Cauquenes":          "Valle de Cauquenes",
    "Siberia":            "Arenales de Cholguán",
    "Yungay":             "Arenales de Cholguán",
    "Human":              "Canteras del Laja",
    "El Kayser":          "Cordillera de Huemules",
    "El Espolón":         "Secanos del Ñuble",
    "Totoral":            "Costa de Queules",
    "Zorzal Blanco":      "Costa de Queules",
    "Puralihue":          "Costa de Queules",
    "Cangrejillo":        "Robles de Coyanmahuida",
    "Concepción":         "Robles de Coyanmahuida",
    "Quilamapu":          "Secanos del Ñuble",
    "Nueva Aldea":        "Valle del Itata",
    "Portezuelo":         "Valle del Itata",
    "Coyanco":            "Valle del Itata",
    "La Colcha":          "Cuenca de Curanilahue",
    "Las Puentes":        "Golfo de Arauco",
    "Lebu":               "Costa Leufú",
    "Llanquehue":         "Cumbres de Nahuelbuta",
    "Santa Juana":        "Biobio Sur",
    "Tanahullin":         "Biobio Sur",
    "Baltimore":          "Malleco",
    "Santa Amelia":       "Malleco",
    "Llongo":             "Bosque Valdiviano",
    "Pancul":             "Bosque Valdiviano",
    "Oldenburgo":         "Río Bueno",
    "La Paz":             "Valle del Rucapillán",
    "Aeródromo Maquehue": "Valle del Rucapillán",
    "Liceo Agrotec":      "Río Bueno",
    "El Copihue":         "Río Bueno",
}

# ═══════════════════════════════════════════════════════════════════════
#  FECHAS — 7 días anteriores al lunes actual
# ═══════════════════════════════════════════════════════════════════════
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
                    p = fr.split("-")
                    fecha = f"{p[2]}-{p[1]}-{p[0]}" if len(p[0]) == 2 else fr
                    val = row.iloc[j]
                    result[nombre][fecha] = round(float(val), 1) if str(val) != "nan" else None
                except:
                    pass
        return result
    except Exception as e:
        print(f"    ✗ Parse error: {e}")
        return {}

# ═══════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════
def main():
    f_ini_web, f_fin_web, f_ini_iso, f_fin_iso = calcular_fechas()
    print(f"Período: {f_ini_iso} → {f_fin_iso}")

    dl_dir      = tempfile.mkdtemp()
    todos_datos = {}
    driver      = crear_driver(dl_dir)
    wait        = WebDriverWait(driver, 20)

    try:
        for i, grupo in enumerate(GRUPOS_ESTACIONES, 1):
            cortos = [e.split(",")[0].strip() for e in grupo]
            print(f"Grupo {i}/{len(GRUPOS_ESTACIONES)}: {', '.join(cortos)}")
            arch = descargar_grupo(driver, wait, grupo, f_ini_web, f_fin_web, dl_dir)
            if arch:
                datos = parsear_excel(arch)
                todos_datos.update(datos)
                print(f"  ✓ {len(datos)} estaciones")
                os.remove(arch)
            else:
                print("  ✗ Sin archivo")
            time.sleep(2)
    finally:
        driver.quit()
        shutil.rmtree(dl_dir, ignore_errors=True)

    # Agrupar por paisaje
    por_paisaje = {}
    for est, dias in todos_datos.items():
        paisaje = next((p for n, p in ESTACION_PAISAJE.items()
                        if n.lower() in est.lower() or est.lower() in n.lower()), None)
        if not paisaje:
            continue
        por_paisaje.setdefault(paisaje, {})[est] = dias

    # Guardar JSON
    os.makedirs("data", exist_ok=True)
    resultado = {
        "generado":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "periodo":     {"inicio": f_ini_iso, "fin": f_fin_iso},
        "estaciones":  todos_datos,
        "por_paisaje": por_paisaje,
    }
    with open("data/precipitaciones.json", "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"\n✅ data/precipitaciones.json — {len(todos_datos)} estaciones, {len(por_paisaje)} paisajes")

if __name__ == "__main__":
    main()