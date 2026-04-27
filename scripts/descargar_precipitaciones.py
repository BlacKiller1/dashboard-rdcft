#!/usr/bin/env python3
"""
descargar_precipitaciones.py
Descarga precipitaciones acumuladas de los últimos 7 días
desde agrometeorologia.cl/PP usando Selenium.

Ejecución manual:
    pip install "selenium>=4.18" pandas openpyxl requests
    python scripts/descargar_precipitaciones.py

Ejecución automática:
    GitHub Actions cada lunes a las 00:30
"""

import io
import json
import os
import sys
import tempfile
import time
import shutil
from datetime import datetime, timedelta

# Forzar UTF-8 en stdout para compatibilidad Windows/Linux
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ═══════════════════════════════════════════════════════════════════════════
#  ESTACIONES — nombre completo → código del sitio agrometeorologia.cl
#  (obtenidos desde el <select id="estaciones"> del sitio)
# ═══════════════════════════════════════════════════════════════════════════
CODIGOS_ESTACIONES = {
    "Carrizal, Constitución, ARAUCO":        "EXT-1003",
    "Curepto, Curepto, ARAUCO":              "EXT-1004",
    "Cuyuname, Empedrado, ARAUCO":           "EXT-991",
    "El Auquil, Pelarco, ARAUCO":            "EXT-992",
    "Hualañé, Hualañé, ARAUCO":              "EXT-983",

    "Palhuen, Curepto, ARAUCO":              "EXT-986",
    "Santa Estela, Constitución, ARAUCO":    "EXT-981",
    "Vivero Quivolgo, Constitución, ARAUCO": "EXT-993",
    "Talca, Talca, INIA":                    "EXT-982",
    "Cauquenes, Cauquenes, INIA":            "INIA-46",

    "Siberia, Yungay, ARAUCO":               "EXT-999",
    "Zorzal Blanco, Quirihue, ARAUCO":       "EXT-989",
    "Human, Yumbel, INIA":                   "INIA-21",
    "El Kayser, Coihueco, ARAUCO":           "EXT-1001",
    "El Espolón, Chillán, ARAUCO":           "EXT-1030",

    "Totoral, Coelemu, ARAUCO":              "EXT-994",
    "Puralihue, Purén, INIA":                "INIA-211",
    "Cangrejillo, Florida, ARAUCO":          "EXT-996",
    "Quilamapu, Chillán, INIA":              "INIA-351",
    "Yungay, Yungay, ARAUCO":               "INIA-49",

    "Nueva Aldea, Ranquil, INIA":            "INIA-24",
    "Portezuelo, Portezuelo, INIA":          "INIA-23",
    "Coyanco, Quillón, ARAUCO":              "EXT-997",
    "Concepción, Concepción, INIA":          None,   # no disponible en el sitio
    "La Colcha, Curanilahue, ARAUCO":        "EXT-990",

    "Las Puentes, Arauco, INIA":             "INIA-308",
    "Lebu, Lebu, INIA":                      "INIA-84",
    "Llanquehue, Llanquehue, INIA":          None,   # no disponible en el sitio
    "Santa Juana, Santa Juana, ARAUCO":      "EXT-998",
    "Tanahullin, Santa Juana, ARAUCO":       "EXT-1006",

    "Baltimore, Collipulli, ARAUCO":         "EXT-1037",
    "Santa Amelia, Collipulli, ARAUCO":      "EXT-1005",
    "Llongo, Mariquina, ARAUCO":             "EXT-995",
    "Pancul, Los Lagos, ARAUCO":             "EXT-985",
    "Oldenburgo, La Unión, ARAUCO":          "EXT-1032",

    "La Paz, Padre Las Casas, INIA":         "INIA-208",
    "Aeródromo Maquehue, Temuco, DMC":       "EXT-163",
    "Liceo Agrotec, Río Bueno, INIA":        "EXT-976",
    "El Copihue, Río Bueno, INIA":           "EXT-1027",
}

# Grupos de estaciones para descargar en lotes
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

# ═══════════════════════════════════════════════════════════════════════════
#  FECHAS — 7 días anteriores al lunes actual
# ═══════════════════════════════════════════════════════════════════════════
def calcular_fechas():
    """
    Calcula rango de 7 días anteriores al lunes actual.
    Retorna: f_ini_web (DD-MM-YYYY), f_fin_web (DD-MM-YYYY),
             f_ini_iso (YYYY-MM-DD), f_fin_iso (YYYY-MM-DD)
    """
    hoy = datetime.now()
    dias_hasta_domingo = (hoy.weekday() + 1) % 7
    domingo = hoy - timedelta(days=dias_hasta_domingo if dias_hasta_domingo > 0 else 7)
    lunes = domingo - timedelta(days=6)
    return (
        lunes.strftime("%d-%m-%Y"),
        domingo.strftime("%d-%m-%Y"),
        lunes.strftime("%Y-%m-%d"),
        domingo.strftime("%Y-%m-%d"),
    )

# ═══════════════════════════════════════════════════════════════════════════
#  DRIVER
# ═══════════════════════════════════════════════════════════════════════════
def crear_driver(dl_dir):
    """Crea Chrome WebDriver configurado para descargas automáticas."""
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")
    prefs = {
        "download.default_directory": dl_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }
    opts.add_experimental_option("prefs", prefs)
    return webdriver.Chrome(options=opts)

# ═══════════════════════════════════════════════════════════════════════════
#  DESCARGA SELENIUM — agrometeorologia.cl/PP
# ═══════════════════════════════════════════════════════════════════════════
def descargar_grupo(driver, wait, grupo, f_ini_web, f_fin_web, dl_dir):
    """
    Descarga Excel diario de un grupo de estaciones desde agrometeorologia.cl/PP.
    Retorna ruta del archivo descargado, o None si falla.

    Hallazgos del formulario real (custom.js):
      - chosen.js transforma los <select>: se setean con jQuery + trigger('chosen:updated')
      - Intervalo 'day' requiere #desde y #hasta (datepicker DD-MM-YYYY), NO month/year
      - Submit final: $('#consultar').submit() desde el handler de #search-btn
    """
    URL = "https://agrometeorologia.cl/PP"

    codigos = [CODIGOS_ESTACIONES[e] for e in grupo if CODIGOS_ESTACIONES.get(e)]
    if not codigos:
        return None

    try:
        driver.get(URL)

        # Esperar que jQuery y chosen.js estén listos
        wait.until(EC.presence_of_element_located((By.ID, "estaciones")))
        wait.until(lambda d: d.execute_script("return typeof $ !== 'undefined' && $.fn.chosen !== undefined"))
        time.sleep(2)

        # Setear todo via jQuery + chosen.js API (como lo lee el handler de #search-btn)
        driver.execute_script(f"""
            // 1. Variable PP_SUM (chosen-select-vars)
            $('#variables').val(['PP_SUM']).trigger('chosen:updated');

            // 2. Estaciones por código (chosen-select-emas)
            $('#estaciones').val({json.dumps(codigos)}).trigger('chosen:updated');

            // 3. Intervalo diario
            $('#intervalo').val('day').trigger('change');

            // 4. Fechas de inicio y fin (requeridas para intervalo 'day' y 'hour')
            $('#desde').val('{f_ini_web}');
            $('#hasta').val('{f_fin_web}');

            // 5. Marcar Excel (desmarcar los demás)
            $('#excel').prop('checked', true);
            $('#csv').prop('checked', false);
            $('#tabla').prop('checked', false);
            $('#grafico').prop('checked', false);
        """)
        time.sleep(1)

        # Verificar que chosen registró los valores
        n_est = driver.execute_script(
            "return ($('.chosen-select-emas').val() || []).length;"
        )
        if n_est == 0:
            print("    ⚠ chosen.js no registró estaciones")
            return None

        # 6. Enviar formulario y esperar la página de respuesta con el link de descarga
        driver.execute_script("$('#consultar').submit();")

        # 7. Esperar que aparezca el link de descarga .xlsx en la respuesta
        #    El servidor genera el archivo y lo expone en /tmp/agrometeorologia-*.xlsx
        import re as _re
        import requests as _req

        link_xlsx = None
        for i in range(60):
            time.sleep(3)
            src = driver.page_source
            matches = _re.findall(r'href="(https?://[^"]+\.xlsx)"', src)
            if matches:
                link_xlsx = matches[-1]  # tomar el más reciente (último en el HTML)
                break
            if i % 10 == 9:
                print(f"    ⏳ Esperando link de descarga... {(i+1)*3}s")

        if not link_xlsx:
            return None

        # 8. Descargar el archivo directamente con requests
        print(f"    ↓ Descargando {link_xlsx.split('/')[-1]}")
        resp = _req.get(link_xlsx, timeout=60,
                        headers={"User-Agent": "Mozilla/5.0",
                                 "Referer": "https://agrometeorologia.cl/PP"})
        if resp.status_code != 200:
            print(f"    ✗ Error HTTP {resp.status_code} al descargar Excel")
            return None

        dest = os.path.join(dl_dir, link_xlsx.split("/")[-1])
        with open(dest, "wb") as fh:
            fh.write(resp.content)
        return dest

    except Exception as e:
        print(f"    ✗ Error descargando grupo: {e}")
        return None

# ═══════════════════════════════════════════════════════════════════════════
#  PARSEO EXCEL — formato agrometeorologia.cl
# ═══════════════════════════════════════════════════════════════════════════
def parsear_excel(arch):
    """
    Parsea Excel de agrometeorologia.cl.
    Busca la fila con 'Tiempo' como encabezado, luego lee
    fechas (columna 0) y valores por estación (columnas 1..n).
    Retorna {nombre_estacion: {fecha_iso: mm_float}}
    """
    try:
        import pandas as pd
        df = pd.read_excel(arch, header=None)

        # Buscar fila de encabezados
        header_row = None
        for i, row in df.iterrows():
            if any("Tiempo" in str(v) for v in row.values):
                header_row = i
                break
        if header_row is None:
            return {}

        df.columns = [str(c).strip() for c in df.iloc[header_row]]
        df = df.iloc[header_row + 1:].reset_index(drop=True)

        result = {}
        fecha_col = df.columns[0]

        for col in df.columns[1:]:
            nombre = str(col).strip()
            # Ignorar columnas de metadatos (% cobertura, nan, nombres de variable, etc.)
            _skip_words = ("nan", "%", "datos", "precipitación", "temperatura",
                           "humedad", "velocidad", "dirección", "radiación",
                           "acumulada", "viento", "presión")
            if not nombre or any(w in nombre.lower() for w in _skip_words):
                continue
            result[nombre] = {}
            for _, row in df.iterrows():
                fr = str(row[fecha_col]).strip()
                try:
                    p = fr.split("-")
                    # Normalizar DD-MM-YYYY → YYYY-MM-DD
                    if len(p) == 3 and len(p[0]) == 2:
                        fecha = f"{p[2]}-{p[1]}-{p[0]}"
                    elif len(p) == 3 and len(p[0]) == 4:
                        fecha = fr  # ya es YYYY-MM-DD
                    else:
                        continue  # no es una fecha válida (disclaimer, nan, etc.)
                    val = row[col]
                    result[nombre][fecha] = round(float(val), 1) if str(val) != "nan" else None
                except Exception:
                    continue  # saltar filas no numéricas (disclaimers, etc.)

        return result

    except Exception as e:
        print(f"    ✗ Parse error: {e}")
        return {}

# ═══════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════
def main():
    f_ini_web, f_fin_web, f_ini_iso, f_fin_iso = calcular_fechas()
    print(f"Periodo: {f_ini_iso} -> {f_fin_iso}")
    print(f"Fechas web: {f_ini_web} -> {f_fin_web}")

    dl_dir      = tempfile.mkdtemp()
    todos_datos = {}
    driver      = crear_driver(dl_dir)
    wait        = WebDriverWait(driver, 20)

    try:
        for i, grupo in enumerate(GRUPOS_ESTACIONES, 1):
            cortos = [e.split(",")[0].strip() for e in grupo]
            print(f"\nGrupo {i}/{len(GRUPOS_ESTACIONES)}: {', '.join(cortos)}")
            arch = descargar_grupo(driver, wait, grupo, f_ini_web, f_fin_web, dl_dir)
            if arch:
                datos = parsear_excel(arch)
                todos_datos.update(datos)
                print(f"  ✓ {len(datos)} estaciones parseadas")
                os.remove(arch)
            else:
                print("  ✗ Sin archivo descargado")
            time.sleep(2)
    finally:
        driver.quit()
        shutil.rmtree(dl_dir, ignore_errors=True)

    # Agrupar por paisaje
    por_paisaje = {}
    for est, dias in todos_datos.items():
        paisaje = next(
            (p for n, p in ESTACION_PAISAJE.items()
             if n.lower() in est.lower() or est.lower() in n.lower()),
            None
        )
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
