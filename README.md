# Portal Meteorológico ARAUCO — RDCFT

Portal web operacional para la toma de decisiones en **Optimización de Reducción de Combustible mediante Fuego Técnico (RDCFT)** en los Paisajes Productivos Protegidos de Arauco.

---

## Plataformas

| Plataforma | Descripción |
|---|---|
| **Portal** | Selector de plataformas (entrada principal) |
| **Plataforma de Protección** | Dashboard meteorológico RDCFT |
| **Alertas Comunales Preventivas** | Mapa ArcGIS embebido |
| **Panel de Administración** | Gestión de usuarios y auditoría |

---

## Funcionalidades

### Pronóstico meteorológico (Dashboard RDCFT)
- **22 paisajes productivos** con coordenadas georeferenciadas agrupados en 4 zonas operacionales
- **Pronóstico de 7 días** con datos horarios (10:00 / 15:00 / 18:00)
- **Regla RDCFT automática** — viento > 10 km/h bloquea la operación
- **Semáforo operacional** por día (Favorable / Con restricciones / No favorable)
- **Comentario operacional** generado automáticamente desde los datos meteorológicos
- **Consulta por coordenadas libres** — pronóstico horario para cualquier punto del mapa
- **Precipitaciones históricas** por estación vinculadas a cada paisaje
- **Exportación a PDF** por paisaje (layout portrait, colores corporativos Arauco)

### Mapa interactivo
- Capas de mapa oscuro, satélite y predios GeoJSON
- **Capa de predios Arauco** — polígonos GeoJSON convertidos desde Esri JSON UTM-18S a WGS84
- **Long press sobre predios** — captura automática de coordenadas para simulación de humo

### Simulación de dispersión de humo (HYSPLIT)
- **Modelo HYSPLIT Ensemble** (NOAA) ejecutado en servidor autoalojado con Docker
- **Trayectorias visualizadas en el mapa** como polilíneas coloreadas por ensemble
- **Streaming en tiempo real** durante simulaciones largas (~1-4 min)
- **Health check automático** con indicador de estado del servidor
- **Informe PDF** de simulación con mapa, coordenadas, rosa de vientos y comentarios

### Autenticación y sesión
- Acceso restringido a usuarios registrados con correo corporativo
- **Sesión única activa** — cierre automático si la cuenta se abre en otro dispositivo
- **Confirmación antes de cerrar sesión**
- **Formulario de solicitud de acceso** desde la pantalla de login
- PIN de seguridad para administradores con flujo de recuperación por correo

### General
- **Banner de mantenimiento** en todas las plataformas — auto-cierre en 7 s
- **PWA** — instalable en móvil, actualización automática de caché
- **Modo oscuro / claro** con persistencia en `localStorage`
- **Diseño responsive** para escritorio y móvil
- Librerías vendor locales (html2canvas, jsPDF, Leaflet) sin dependencia de CDNs externos

---

## Estructura del proyecto

```
dashboard-rdcft/
├── pages/                      — Páginas de cada plataforma
├── css/                        — Estilos y paleta visual
├── js/                         — Lógica de frontend (vanilla JS)
│   └── vendor/                 — Librerías locales (Leaflet, jsPDF, html2canvas)
├── api/                        — Funciones serverless (Vercel)
├── scripts/                    — Backend Python (HYSPLIT, precipitaciones)
├── data/                       — Datos estáticos y GeoJSON de predios
├── img/                        — Imágenes de fondo de login
├── icons/                      — Iconos PWA
├── .github/workflows/          — Automatización (precipitaciones + caché PWA)
├── index.html                  — Portal principal
├── service-worker.js           — PWA: caché de recursos estáticos
├── manifest.json               — Manifiesto PWA
├── Dockerfile                  — Imagen Docker para servidor HYSPLIT
└── vercel.json                 — Configuración Vercel + headers de seguridad
```

---

## Roles de acceso

| Rol | Permisos |
|---|---|
| `usuario` | Ver dashboard, consultar coordenadas, descargar PDF |
| `admin` | Todo lo anterior + panel de gestión de usuarios + auditoría |

---

## Servidor HYSPLIT (autoalojado)

El módulo de simulación usa **NOAA HYSPLIT Ensemble** para predecir dispersión de humo desde un punto de ignición.

### Arquitectura
- **Frontend**: interfaz, mapa de trayectorias y PDF
- **Backend**: Flask autoalojado con Docker, ejecuta HYSPLIT vía Selenium y transmite resultados en streaming

### Flujo
1. Usuario ingresa coordenadas (manual o long press sobre predio)
2. Cliente conecta al servidor y recibe progreso en tiempo real
3. Servidor ejecuta HYSPLIT Ensemble (~1-4 min)
4. Trayectorias se renderizan como polilíneas coloreadas en el mapa

### Despliegue
```bash
docker build -t rdcft-backend .
docker run -d --name rdcft-backend --restart unless-stopped -p 8080:8080 rdcft-backend
```
Requiere nginx como proxy inverso con SSL (Let's Encrypt) y DuckDNS para IP dinámica.

---

## Automatización de precipitaciones

El script de descarga usa Selenium para obtener precipitaciones acumuladas desde [agrometeorologia.cl](https://www.agrometeorologia.cl) y actualiza el archivo de datos históricos automáticamente cada **lunes a las 00:30 hora Chile** vía GitHub Actions.

---

## Desarrollo local

```bash
git clone https://github.com/BlacKiller1/dashboard-rdcft.git
```

Abre `index.html` con **Live Server** en VS Code. El sistema detecta `file://` y usa archivos locales automáticamente.

Para el servidor HYSPLIT local:
```bash
pip install -r scripts/requirements.txt
python scripts/server.py
```

---

## Variables meteorológicas

| Variable | Fuente | Unidad |
|---|---|---|
| Temperatura | Open-Meteo (2 m) | °C |
| Humedad relativa | Open-Meteo (2 m) | % |
| Precipitación pronosticada | Open-Meteo | mm |
| Velocidad del viento | Open-Meteo (10 m) | km/h |
| Racha máxima | Open-Meteo (10 m) | km/h |
| Dirección del viento | Open-Meteo (10 m) | ° / Cardinal |
| Nubosidad | Open-Meteo | % |
| Punto de rocío | Open-Meteo | °C |
| Precipitación histórica | agrometeorologia.cl | mm |
| Trayectorias HYSPLIT | NOAA HYSPLIT Ensemble + GFS Global | — |

---

## Tecnologías

- HTML / CSS / JavaScript vanilla — sin frameworks frontend
- [Open-Meteo](https://open-meteo.com) — pronóstico meteorológico sin API key
- [Leaflet](https://leafletjs.com) — mapas interactivos (local)
- [Chart.js](https://www.chartjs.org) — gráficos de variables climáticas
- [html2canvas](https://html2canvas.hertzen.com) + [jsPDF](https://github.com/parallax/jsPDF) — exportación PDF (local)
- [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php) — modelo de dispersión
- Python + Flask — servidor de simulación
- Docker + nginx + Let's Encrypt + DuckDNS — servidor autoalojado con HTTPS
- Python + Selenium — descarga automática de precipitaciones
- Vercel Serverless Functions — API de autenticación
- GitHub Actions — automatización semanal + caché PWA

---

*Datos meteorológicos: [Open-Meteo](https://open-meteo.com) — CC BY 4.0*
*Precipitaciones: [agrometeorologia.cl](https://www.agrometeorologia.cl)*
*Dispersión de humo: [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php)*-.
