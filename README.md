# 🌲 Dashboard Meteorológico RDCFT — Arauco

Dashboard web interactivo para la toma de decisiones operacionales en **Reducción de Combustibles mediante Fuego Técnico (RDCFT)** en los Paisajes Productivos Protegidos de Arauco.

---

## ¿Qué hace?

Consulta en tiempo real el pronóstico meteorológico de cada paisaje productivo protegido a través de la API de [Open-Meteo](https://open-meteo.com), y evalúa automáticamente si las condiciones permiten o no realizar operaciones de fuego técnico según la **regla operacional de viento ≤ 10 km/h**.

Además, descarga y visualiza automáticamente los **datos históricos de precipitaciones acumuladas** desde [agrometeorologìa.cl](https://www.agrometeorologia.cl) para cada estación de las zonas operacionales.

---

## Funcionalidades

- 📍 **22 paisajes productivos** con coordenadas georeferenciadas
- 🌤 **Pronóstico de 7 días** con datos horarios (10:00 / 15:00 / 18:00)
- 🔥 **Regla RDCFT automática** — viento > 10 km/h bloquea la operación
- 🚦 **Semáforo operacional** por día (Operable / Parcial / No operable)
- 📝 **Comentario operacional** generado automáticamente desde los datos meteorológicos
- 📍 **Consulta por coordenadas libres** — pronóstico horario para cualquier punto, cualquier día (hasta 15 días)
- 🌧 **Tabla meteorológica mejorada** con visualización por zonas y semáforo por variable
- 📄 **Exportación a PDF** de la lámina completa por paisaje
- 🤖 **Descarga automática de precipitaciones** vía script Python con Selenium
- ⚙️ **GitHub Actions** — actualización automática de precipitaciones cada lunes a las 00:30

---

## Variables meteorológicas

| Variable | Fuente | Unidad |
|---|---|---|
| Temperatura | Open-Meteo (2m) | °C |
| Humedad relativa | Open-Meteo (2m) | % |
| Precipitación | Open-Meteo | mm |
| Velocidad del viento | Open-Meteo (10m) | km/h |
| Racha máxima | Open-Meteo (10m) | km/h |
| Dirección del viento | Open-Meteo (10m) | ° / Cardinal |
| Precipitación histórica | agrometeorologia.cl | mm |

---

## Estructura del proyecto

```
dashboard-rdcft/
├── index.html                          ← Estructura principal
├── css/
│   └── styles.css                      ← Estilos y paleta visual
├── js/
│   ├── paisajes.js                     ← Coordenadas y datos de los 22 paisajes
│   ├── weather.js                      ← Integración Open-Meteo API + regla RDCFT
│   ├── ui.js                           ← Renderizado e interacción
│   └── app.js                          ← Controlador principal
├── data/
│   └── precipitaciones.json            ← Datos históricos de precipitaciones
├── scripts/
│   └── descargar_precipitaciones.py    ← Script Python para descarga automática
└── .github/
    └── workflows/
        └── precipitaciones.yml         ← GitHub Action (ejecución automática)
```

---

## Automatización de precipitaciones

El script `scripts/descargar_precipitaciones.py` usa **Selenium** para descargar automáticamente los datos de precipitaciones acumuladas desde [agrometeorologia.cl](https://www.agrometeorologia.cl) y actualiza el archivo `data/precipitaciones.json`.

### Ejecución manual

```bash
pip install selenium webdriver-manager pandas openpyxl
python scripts/descargar_precipitaciones.py
```

### Ejecución automática (GitHub Actions)

El workflow `.github/workflows/precipitaciones.yml` ejecuta el script automáticamente **cada lunes a las 00:30**, manteniendo los datos de precipitaciones siempre actualizados en el repositorio.

---

## Tecnologías

- HTML / CSS / JavaScript vanilla — sin frameworks
- [Open-Meteo API](https://open-meteo.com) — pronóstico meteorológico gratuito y sin API key
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) — exportación a PDF
- Python + Selenium + pandas — descarga automática de precipitaciones
- GitHub Actions — automatización semanal

---

## Uso local

1. Clona el repositorio
   ```bash
   git clone https://github.com/BlacKiller1/dashboard-rdcft.git
   ```
2. Abre la carpeta en VS Code
3. Lanza con **Live Server** (clic derecho sobre `index.html` → *Open with Live Server*)

> ⚠️ Requiere Live Server u otro servidor local para que las llamadas a la API funcionen correctamente. No abrir `index.html` directo con doble clic.

---

## Configuración

Para ajustar el **límite operacional de viento**, edita una sola línea en `js/weather.js`:

```javascript
const VIENTO_LIMITE_RDCFT = 10; // km/h
```

Para actualizar **coordenadas de paisajes**, edita `js/paisajes.js`.

---

## Desarrollado para

**Central Protección Arauco** — Gestión y planificación de operaciones de fuego técnico en paisajes productivos del sur de Chile.

---

*Datos meteorológicos provistos por [Open-Meteo](https://open-meteo.com) bajo licencia CC BY 4.0*
*Datos de precipitaciones provistos por [agrometeorologia.cl](https://www.agrometeorologia.cl)*