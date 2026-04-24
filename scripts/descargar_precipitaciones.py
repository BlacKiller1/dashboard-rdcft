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

import os, json, time, glob, shutil, tempfile
import pandas as pd
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
    hoy  = datetime.now()
    dias = (hoy.weekday() + 1) % 7
    dom  = hoy - timedelta(days=dias if dias > 0 else 7)
    lun  = dom - timedelta(days=6)
    # Formato web DD-MM-YYYY y formato ISO YYYY-MM-DD
    return (lun.strftime("%d-%m-%Y"), dom.strftime("%d-%m-%Y"),
            lun.strftime("%Y-%m-%d"), dom.strftime("%Y-%m-%d"))

# ═══════════════════════════════════════════════════════════════════════
#  DRIVER CHROME
# ═══════════════════════════════════════════════════════════════════════
def crear_driver(download_dir):
    opts = Options()
    if os.environ.get("CI"):               # GitHub Actions — sin ventana
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
    opts.add_argument("--window-size=1366,768")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36")
    opts.add_experimental_option("prefs", {
        "download.default_directory":   download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade":   True,
        "safebrowsing.enabled":         True,
    })
    svc    = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=svc, options=opts)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"})
    return driver

# ═══════════════════════════════════════════════════════════════════════
#  DESCARGA DE UN GRUPO
# ═══════════════════════════════════════════════════════════════════════
def descargar_grupo(driver, wait, estaciones, f_ini, f_fin, download_dir):
    try:
        driver.get("https://agrometeorologia.cl/PP_DIA")
        time.sleep(4)

        # Abrir formulario si está colapsado
        try:
            btn = driver.find_element(By.CSS_SELECTOR, "a[href*='form-collapse'], .ts-form-collapse")
            btn.click()
            time.sleep(1)
        except:
            pass

        # Seleccionar cada estación
        for est in estaciones:
            nombre_corto = est.split(",")[0].strip()
            try:
                # Clic en el input del selector de estaciones
                inp = wait.until(EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, ".ts-wrapper.multi .ts-control, .selectize-input")))
                inp.click()
                time.sleep(0.5)

                # Escribir nombre
                campo = driver.find_element(By.CSS_SELECTOR,
                    ".ts-wrapper.multi input, .selectize-input input")
                campo.send_keys(nombre_corto)
                time.sleep(1.5)

                # Elegir primera opción que coincida
                ops = driver.find_elements(By.CSS_SELECTOR,
                    ".ts-dropdown .option, .selectize-dropdown .option")
                for op in ops:
                    if nombre_corto.lower() in op.text.lower():
                        op.click()
                        time.sleep(0.4)
                        break
            except Exception as e:
                print(f"    ⚠ '{nombre_corto}': {e}")

        # Fechas
        try:
            fi = datetime.strptime(f_ini, "%d-%m-%Y").strftime("%Y-%m-%d")
            ff = datetime.strptime(f_fin, "%d-%m-%Y").strftime("%Y-%m-%d")
            inputs_fecha = driver.find_elements(By.CSS_SELECTOR,
                "input[type='date'], input[name*='start'], input[name*='end']")
            if len(inputs_fecha) >= 2:
                driver.execute_script(f"arguments[0].value='{fi}'", inputs_fecha[0])
                driver.execute_script(f"arguments[1].value='{ff}'", inputs_fecha[1])
        except Exception as e:
            print(f"    ⚠ Fechas: {e}")

        # Snapshot de archivos antes de descargar
        antes = set(glob.glob(os.path.join(download_dir, "agro*.xlsx")) +
                    glob.glob(os.path.join(download_dir, "agro*.csv")))

        # Clic en descargar Excel
        try:
            btn_dl = wait.until(EC.element_to_be_clickable((By.XPATH,
                "//button[contains(.,'Excel')] | //a[contains(.,'Excel')] | "
                "//input[@value='Excel'] | //button[contains(.,'Descargar')]")))
            btn_dl.click()
        except:
            try:
                driver.find_element(By.CSS_SELECTOR,
                    "button[type='submit'], input[type='submit']").click()
            except Exception as e:
                print(f"    ✗ Botón descarga: {e}")
                return None

        # Esperar archivo
        for _ in range(30):
            time.sleep(1)
            despues = set(glob.glob(os.path.join(download_dir, "agro*.xlsx")) +
                          glob.glob(os.path.join(download_dir, "agro*.csv")))
            nuevos  = despues - antes
            if nuevos:
                time.sleep(1)
                return list(nuevos)[0]

        print("    ⚠ Timeout descarga")
        return None

    except Exception as e:
        print(f"    ✗ Error grupo: {e}")
        return None

# ═══════════════════════════════════════════════════════════════════════
#  PARSEAR EXCEL
# ═══════════════════════════════════════════════════════════════════════
def parsear_excel(archivo):
    try:
        df = pd.read_excel(archivo, header=None)
        # Buscar fila con "Tiempo"
        hrow = None
        for i, row in df.iterrows():
            if any("Tiempo" in str(v) for v in row.values):
                hrow = i; break
        if hrow is None:
            return {}

        headers = df.iloc[hrow].tolist()
        data    = df.iloc[hrow + 1:]
        result  = {}

        for j, h in enumerate(headers):
            h = str(h).strip()
            if not h or h == "nan" or "%" in h or "Tiempo" in h:
                continue
            nombre = h.split(",")[0].strip()
            if not nombre or nombre == "nan":
                continue
            result[nombre] = {}
            for _, row in data.iterrows():
                fr = str(row.iloc[0]).strip()
                if not fr or fr == "nan" or "uso" in fr.lower():
                    continue
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