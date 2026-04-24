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

import sys, os, json, time, glob, shutil, tempfile
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
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
    """
    f_ini / f_fin en formato dd-mm-yyyy (ej. "17-04-2026")
    El sitio usa Bootstrap Datepicker con ese mismo formato.
    """
    try:
        driver.get("https://agrometeorologia.cl/PP")
        time.sleep(4)

        # Abrir panel "CONSULTAR DATOS" (toggle collapse)
        try:
            toggle = wait.until(EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "a[data-target='collapse'], a.ts-center__vertical")))
            toggle.click()
            time.sleep(1.5)
        except:
            pass  # El panel puede ya estar visible

        # --- Estaciones via jQuery Chosen ---
        nombres = [e.split(",")[0].strip() for e in estaciones]
        encontrados = driver.execute_script("""
            var names = arguments[0];
            var select = document.getElementById('estaciones');
            var vals = [];
            Array.from(select.options).forEach(function(opt) {
                names.forEach(function(name) {
                    if (opt.text.toLowerCase().startsWith(name.toLowerCase())) {
                        vals.push(opt.value);
                    }
                });
            });
            $('#estaciones').val(vals).trigger('chosen:updated');
            return vals.length;
        """, nombres)
        print(f"    Estaciones encontradas: {encontrados}/{len(nombres)}")
        time.sleep(0.5)

        # --- Variable: Precipitación Acumulada ---
        driver.execute_script(
            "$('#variables').val(['PP_SUM']).trigger('chosen:updated');"
        )
        time.sleep(0.3)

        # --- Intervalo: Día ---
        driver.execute_script(
            "$('#intervalo').val('day').trigger('chosen:updated');"
        )
        time.sleep(0.3)

        # --- Fechas via Bootstrap Datepicker (formato dd-mm-yyyy) ---
        driver.execute_script("""
            $('#desde').datepicker('setDate', arguments[0]);
            $('#hasta').datepicker('setDate', arguments[1]);
        """, f_ini, f_fin)
        print(f"    Fechas: {f_ini} → {f_fin}")
        time.sleep(0.3)

        # --- Marcar solo Excel ---
        driver.execute_script("""
            document.getElementById('tabla').checked   = false;
            document.getElementById('grafico').checked = false;
            document.getElementById('excel').checked   = true;
            document.getElementById('csv').checked     = false;
        """)
        time.sleep(0.3)

        # Snapshot archivos antes
        antes = set(glob.glob(os.path.join(download_dir, "*.xlsx")) +
                    glob.glob(os.path.join(download_dir, "*.csv")))

        # Clic en CONSULTAR DATOS
        btn_dl = wait.until(EC.element_to_be_clickable((By.ID, "search-btn")))
        btn_dl.click()

        # Esperar archivo descargado
        for _ in range(45):
            time.sleep(1)
            despues = set(glob.glob(os.path.join(download_dir, "*.xlsx")) +
                          glob.glob(os.path.join(download_dir, "*.csv")))
            nuevos  = despues - antes
            if nuevos and not list(nuevos)[0].endswith(".crdownload"):
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