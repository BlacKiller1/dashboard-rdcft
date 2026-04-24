#!/usr/bin/env python3
"""
descargar_precipitaciones.py
Descarga precipitaciones acumuladas de los Ãºltimos 7 dÃ­as
desde agrometeorologia.cl usando Selenium (simula navegador real).

EjecuciÃ³n manual:
    pip install selenium webdriver-manager pandas openpyxl
    python scripts/descargar_precipitaciones.py

EjecuciÃ³n automÃ¡tica:
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

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  ESTACIONES â€” nombre exacto como aparece en agrometeorologia.cl
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
GRUPOS_ESTACIONES = [
    ["Carrizal, ConstituciÃ³n, ARAUCO",
     "Curepto, Curepto, ARAUCO",
     "Cuyuname, Empedrado, ARAUCO",
     "El Auquil, Pelarco, ARAUCO",
     "HualaÃ±Ã©, HualaÃ±Ã©, ARAUCO"],

    ["Palhuen, Curepto, ARAUCO",
     "Santa Estela, ConstituciÃ³n, ARAUCO",
     "Vivero Quivolgo, ConstituciÃ³n, ARAUCO",
     "Talca, Talca, INIA",
     "Cauquenes, Cauquenes, INIA"],

    ["Siberia, Yungay, ARAUCO",
     "Zorzal Blanco, Quirihue, ARAUCO",
     "Human, Yumbel, INIA",
     "El Kayser, Coihueco, ARAUCO",
     "El EspolÃ³n, ChillÃ¡n, ARAUCO"],

    ["Totoral, Coelemu, ARAUCO",
     "Puralihue, PurÃ©n, INIA",
     "Cangrejillo, Florida, ARAUCO",
     "Quilamapu, ChillÃ¡n, INIA",
     "Yungay, Yungay, ARAUCO"],

    ["Nueva Aldea, Ranquil, INIA",
     "Portezuelo, Portezuelo, INIA",
     "Coyanco, QuillÃ³n, ARAUCO",
     "ConcepciÃ³n, ConcepciÃ³n, INIA",
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
     "Oldenburgo, La UniÃ³n, ARAUCO"],

    ["La Paz, Padre Las Casas, INIA",
     "AerÃ³dromo Maquehue, Temuco, DMC",
     "Liceo Agrotec, RÃ­o Bueno, INIA",
     "El Copihue, RÃ­o Bueno, INIA"],
]

ESTACION_PAISAJE = {
    "Carrizal":           "Lomas de Quivolgo",
    "Curepto":            "Secanos del Mataquito",
    "Cuyuname":           "Ruiles de la Costa Maulina",
    "El Auquil":          "Cordillera del Maule",
    "HualaÃ±Ã©":            "Valle de Cauquenes",
    "Palhuen":            "Secanos del Mataquito",
    "Santa Estela":       "Ruiles de la Costa Maulina",
    "Vivero Quivolgo":    "Lomas de Quivolgo",
    "Talca":              "Cordillera del Maule",
    "Cauquenes":          "Valle de Cauquenes",
    "Siberia":            "Arenales de CholguÃ¡n",
    "Yungay":             "Arenales de CholguÃ¡n",
    "Human":              "Canteras del Laja",
    "El Kayser":          "Cordillera de Huemules",
    "El EspolÃ³n":         "Secanos del Ã‘uble",
    "Totoral":            "Costa de Queules",
    "Zorzal Blanco":      "Costa de Queules",
    "Puralihue":          "Costa de Queules",
    "Cangrejillo":        "Robles de Coyanmahuida",
    "ConcepciÃ³n":         "Robles de Coyanmahuida",
    "Quilamapu":          "Secanos del Ã‘uble",
    "Nueva Aldea":        "Valle del Itata",
    "Portezuelo":         "Valle del Itata",
    "Coyanco":            "Valle del Itata",
    "La Colcha":          "Cuenca de Curanilahue",
    "Las Puentes":        "Golfo de Arauco",
    "Lebu":               "Costa LeufÃº",
    "Llanquehue":         "Cumbres de Nahuelbuta",
    "Santa Juana":        "Biobio Sur",
    "Tanahullin":         "Biobio Sur",
    "Baltimore":          "Malleco",
    "Santa Amelia":       "Malleco",
    "Llongo":             "Bosque Valdiviano",
    "Pancul":             "Bosque Valdiviano",
    "Oldenburgo":         "RÃ­o Bueno",
    "La Paz":             "Valle del RucapillÃ¡n",
    "AerÃ³dromo Maquehue": "Valle del RucapillÃ¡n",
    "Liceo Agrotec":      "RÃ­o Bueno",
    "El Copihue":         "RÃ­o Bueno",
}

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  FECHAS â€” 7 dÃ­as anteriores al lunes actual
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
def calcular_fechas():
    """
    Calcula rango de 7 dÃ­as anteriores al lunes actual.
    Lunes 28 abril â†’ rango: lunes 21 abril al domingo 27 abril
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

    # Buscar lÃ­nea de encabezados
    header_idx = None
    for i, line in enumerate(lines):
        if "Tiempo" in line or any(est in line for est in estaciones):
            header_idx = i
            break

    if header_idx is None:
        return resultado

    headers = [h.strip() for h in lines[header_idx].split("\t")]

    # Mapear estaciones a Ã­ndices de columna
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

# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
#  MAIN
# â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
def main():
    f_ini_web, f_fin_web, f_ini_iso, f_fin_iso = calcular_fechas()
    print(f"PerÃ­odo: {f_ini_iso} â†’ {f_fin_iso}")

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
                print(f"  âœ“ {len(datos)} estaciones")
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

    print(f"\nâœ… data/precipitaciones.json â€” {len(todos_datos)} estaciones, {len(por_paisaje)} paisajes")

if __name__ == "__main__":
    main()

