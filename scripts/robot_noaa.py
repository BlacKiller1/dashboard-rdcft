from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.common.exceptions import StaleElementReferenceException
import time

def iniciar_robot_moderno():
    options = Options()
    options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-gpu')
    options.add_argument('--disable-software-rasterizer')
    options.add_argument('--window-size=1280,900')
    
    try:
        driver = webdriver.Chrome(options=options)
        return driver
    except Exception as e:
        print(f"❌ Error al iniciar Chrome: {e}")
        return None

def obtener_kmz_ensemble(lat, lon, altura):
    driver = iniciar_robot_moderno()
    if not driver:
        return None
        
    def avanzar_y_esperar(url_esperada, timeout=20):
        try:
            botones = driver.find_elements(By.XPATH, "//input[@type='submit' or @type='button' or @type='image'] | //button")
            clickeado = False
            for btn in botones:
                val = str(btn.get_attribute("value") or btn.text or btn.get_attribute("name") or "").lower()
                if any(x in val for x in ["next", "request", "submit", "cont"]) and not any(x in val for x in ["clear", "reset"]):
                    driver.execute_script("arguments[0].scrollIntoView(true);", btn)
                    time.sleep(0.5)
                    btn.click()
                    clickeado = True
                    break
            if not clickeado:
                driver.execute_script("if(document.forms.length > 0) document.forms[0].submit();")
        except:
            driver.execute_script("if(document.forms.length > 0) document.forms[0].submit();")
            
        espera = 0
        while url_esperada not in driver.current_url and espera < timeout:
            time.sleep(1)
            espera += 1
            try:
                driver.switch_to.alert.accept()
            except:
                pass
                
        if url_esperada not in driver.current_url:
            raise Exception(f"¡Atasco! Se agotaron los {timeout}s. URL: {driver.current_url}")
            
        time.sleep(2) 

    try:
        print("🚀 Conectando a los servidores de NOAA HYSPLIT...")
        driver.get("https://www.ready.noaa.gov/hypub-bin/trajtype.pl")
        time.sleep(2)
        
        # --- PASO 1: Tipo de Vuelo ---
        print(f"📄 PASO 1 (Tipo de Vuelo) -> {driver.current_url.split('/')[-1]}")
        driver.execute_script("""
            var radios = document.querySelectorAll('input[type="radio"]');
            for(var i=0; i<radios.length; i++) {
                var txt = radios[i].nextSibling ? (radios[i].nextSibling.textContent || "").toLowerCase().trim() : "";
                var val = (radios[i].value || "").toLowerCase();
                if (txt === "ensemble" || val === "ensemble" || txt === "1" || val === "1") { 
                    radios[i].checked = true; 
                }
            }
        """)
        avanzar_y_esperar("trajsrc.pl")

        # --- PASO 2: Ubicación y Meteorología ---
        print(f"📄 PASO 2 (Ubicación y Meteorología) -> {driver.current_url.split('/')[-1]}")
        script_ubicacion = f"""
            var lat_val = Math.abs({lat});
            var lon_val = Math.abs({lon});
            var lat_dir = {lat} < 0 ? "S" : "N";
            var lon_dir = {lon} < 0 ? "W" : "E";

            if(document.getElementsByName('Lat').length > 0) document.getElementsByName('Lat')[0].value = lat_val;
            if(document.getElementsByName('Lon').length > 0) document.getElementsByName('Lon')[0].value = lon_val;

            var selects = document.querySelectorAll('select');
            for(var i=0; i<selects.length; i++) {{
                var name = selects[i].name.toLowerCase();
                
                if(name.includes("lat")) selects[i].value = lat_dir;
                if(name.includes("lon")) selects[i].value = lon_dir;
                
                // Forzar GFS Global para evitar errores de coordenadas
                if(name.includes("met")) {{
                    for(var j=0; j<selects[i].options.length; j++) {{
                        var txt = selects[i].options[j].text.toLowerCase();
                        if(txt.includes("gfs") && txt.includes("global")) {{
                            selects[i].selectedIndex = j;
                            break;
                        }}
                    }}
                }}
            }}
        """
        driver.execute_script(script_ubicacion)
        avanzar_y_esperar("trajsrcm.pl")

        # --- PASO 3: Ciclo Meteorológico ---
        print(f"📄 PASO 3 (Ciclo Meteorológico) -> {driver.current_url.split('/')[-1]}")
        avanzar_y_esperar("traj1.pl")

        # --- PASO 4: Configuración Final ---
        print(f"📄 PASO 4 (Configuración Final) -> {driver.current_url.split('/')[-1]}")
        script_final = f"""
            if(document.getElementsByName('Lat').length > 0) document.getElementsByName('Lat')[0].value = '{lat}';
            if(document.getElementsByName('Lon').length > 0) document.getElementsByName('Lon')[0].value = '{lon}';

            var hgts = ["Hght1", "Height1", "hgt1", "Hgt1", "Level1"];
            for(var i=0; i<hgts.length; i++) {{
                if(document.getElementsByName(hgts[i]).length > 0) {{
                    document.getElementsByName(hgts[i])[0].value = '{altura}';
                }}
            }}

            var radios = document.querySelectorAll('input[type="radio"]');
            for(var i=0; i<radios.length; i++) {{
                var parentText = (radios[i].parentNode.innerText || "").toLowerCase();
                var nextText = radios[i].nextSibling ? (radios[i].nextSibling.textContent || "").toLowerCase() : "";
                if (parentText.includes("google earth") || nextText.includes("kmz")) {{ radios[i].checked = true; }}
            }}

            var checks = document.querySelectorAll('input[type="checkbox"]');
            for(var i=0; i<checks.length; i++) {{
                var parentText = (checks[i].parentNode.innerText || "").toLowerCase();
                var nextText = checks[i].nextSibling ? (checks[i].nextSibling.textContent || "").toLowerCase() : "";
                if (parentText.includes("terrain height") || nextText.includes("terrain height")) {{ checks[i].checked = true; }}
            }}
        """
        driver.execute_script(script_final)
        print("✔️ Todos los parámetros inyectados. Modelo Global GFS asegurado.")
        
        print("⏳ Solicitando cálculo Ensemble al servidor (esperando hasta 120s)...")
        avanzar_y_esperar("trajresults.pl", timeout=120)

        # --- PASO 5: El Buscador Paciente (Resultados) ---
        print(f"📄 PASO 5 (Resultados) -> URL: {driver.current_url}")
        
        # Verificamos si la NOAA colapsó en su backend (Error 404/Fortran)
        if "CONTROL" in driver.page_source or "not able to create" in driver.page_source:
             print("⚠️ La NOAA rechazó la simulación por un error en sus servidores backend.")
             return None

        print("🔍 Esperando a que el servidor compile los gráficos y aparezca la tabla de resultados (hasta 60s)...")
        
        kmz_url = None
        tiempo_espera = 0
        
        # Bucle de escaneo: revisa la página cada 3 segundos buscando el .kmz
        while tiempo_espera < 60:
            try:
                enlaces = driver.find_elements(By.TAG_NAME, "a")
                for enlace in enlaces:
                    href = str(enlace.get_attribute("href"))
                    texto = str(enlace.text).lower()
                    
                    if "google earth" in texto or "kmz" in texto or href.lower().endswith(".kmz"):
                        if href and href != "none":
                            if not href.startswith("http"):
                                kmz_url = "https://www.ready.noaa.gov" + href
                            else:
                                kmz_url = href
                            break # Rompe el for loop
                
                if kmz_url:
                    break # Rompe el while loop
                    
            except StaleElementReferenceException:
                pass # Ignora si la página se recargó mientras leía
                
            time.sleep(3)
            tiempo_espera += 3
            print(f"   ... esperando archivo ({tiempo_espera}s)")
                
        if kmz_url:
            print("\n✅ ¡MISIÓN CUMPLIDA! Trayectoria Ensemble y Terreno listos.")
            print(f"📥 Link de descarga directo: {kmz_url}\n")
            return kmz_url
        else:
            print("⚠️ El cálculo terminó, pero el link del KMZ nunca apareció en la tabla.")
            print(f"Revisa manualmente la página: {driver.current_url}")
            return None

    except Exception as e:
        print(f"❌ Error crítico: {e}")
        return None
    finally:
        driver.quit()

# --- PARA PROBARLO DE FORMA INDEPENDIENTE ---
if __name__ == "__main__":
    # Puedes cambiar estas coordenadas para hacer pruebas
    lat_prueba = -37.7127968
    lon_prueba = -73.0957029
    altura_prueba = 500
    
    enlace_final = obtener_kmz_ensemble(lat=lat_prueba, lon=lon_prueba, altura=altura_prueba)