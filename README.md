# Portal Meteorológico ARAUCO — RDCFT

Portal web operacional para la toma de decisiones en **Optimización de Reducción de Combustible mediante Fuego Técnico (RDCFT)** en los Paisajes Productivos Protegidos de Arauco.

**Producción:** [arauco-rdcft.vercel.app](https://arauco-rdcft.vercel.app)

---

## Plataformas

| Plataforma | Descripción | Ruta |
|---|---|---|
| **Portal** | Selector de plataformas (entrada principal) | `/` |
| **Plataforma de Protección** | Dashboard meteorológico RDCFT | `/pages/dashboard.html` |
| **Alertas Comunales Preventivas** | Mapa ArcGIS embebido | `/pages/alertas.html` |
| **Panel de Administración** | Gestión de usuarios y auditoría | `/pages/admin.html` |

---

## Funcionalidades

### Pronóstico meteorológico
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
- **Streaming SSE** para resultados en tiempo real durante simulaciones largas (~1-4 min)
- **Health check automático** con indicador de estado del servidor
- **Informe PDF** de simulación con mapa, coordenadas, rosa de vientos y comentarios

### Autenticación y sesión
- Login restringido a correos `@arauco.com` registrados
- **Sesión única activa** — cierre automático si la cuenta se abre en otro dispositivo
- **Confirmación antes de cerrar sesión** con redirección al portal
- **Formulario de solicitud de acceso** desde la pantalla de login
- PIN de seguridad para administradores

### General
- **PWA** — instalable en móvil, actualización automática de caché
- **Modo oscuro / claro** con persistencia en `localStorage`
- **Diseño responsive** para escritorio y móvil
- Librerías vendor locales (html2canvas, jsPDF, Leaflet) sin dependencia de CDNs

---

## Estructura del proyecto

```
dashboard-rdcft/
├── pages/
│   ├── dashboard.html          — Dashboard meteorológico RDCFT
│   ├── alertas.html            — Alertas Comunales Preventivas (ArcGIS embebido)
│   └── admin.html              — Panel de administración de usuarios
├── css/
│   └── styles.css              — Estilos, paleta visual, modo claro/oscuro
├── js/
│   ├── paisajes.js             — Coordenadas y datos de los 22 paisajes
│   ├── weather.js              — Integración Open-Meteo API + regla RDCFT
│   ├── ui.js                   — Renderizado, interacción y exportación PDF
│   ├── app.js                  — Controlador principal + toggle de tema
│   ├── login.js                — Autenticación, sesión única y panel de usuarios
│   ├── map-picker.js           — Mapa interactivo Leaflet + selector de coordenadas
│   ├── humo.js                 — Simulación HYSPLIT, mapa de trayectorias y PDF
│   └── admin.js                — Lógica del panel de administración
├── api/
│   ├── verificar.js            — POST: verifica correo y emite token firmado
│   ├── token.js                — GET: lista de usuarios (requiere auth admin)
│   └── usuarios.js             — POST: actualiza usuarios y redespliega
├── scripts/
│   ├── server.py               — Servidor Flask con SSE para simulación HYSPLIT
│   ├── robot_noaa.py           — Automatización Selenium para NOAA HYSPLIT
│   ├── descargar_precipitaciones.py — Descarga automática de precipitaciones
│   ├── generar_pdf_humo.py     — Generación de informe PDF de simulación
│   └── requirements.txt        — Dependencias Python del servidor
├── data/
│   ├── precipitaciones.json    — Precipitaciones históricas (actualización automática)
│   └── predios.geojson         — Polígonos GeoJSON de predios Arauco (WGS84)
├── icons/                      — Iconos PWA
├── .github/
│   └── workflows/
│       ├── precipitaciones.yml         — Descarga automática cada lunes 00:30
│       └── update-pwa-cache.yml        — Actualiza versión de caché PWA en cada push
├── index.html                  — Portal selector de plataformas (entrada principal)
├── service-worker.js           — PWA: caché de recursos estáticos
├── manifest.json               — Manifiesto PWA
├── Dockerfile                  — Imagen Docker para servidor HYSPLIT
├── vercel.json                 — Configuración Vercel + headers de seguridad + CSP
└── package.json
```

> `data/usuarios.json` está en `.gitignore`. En producción los usuarios se almacenan en la variable de entorno `USUARIOS_DB`.

---

## Autenticación

### Flujo de login
1. El usuario ingresa su correo corporativo `@arauco.com`
2. El cliente envía el correo al endpoint `/api/verificar`
3. El servidor valida contra `USUARIOS_DB` y emite un **token HMAC-SHA256** firmado con `ADMIN_SECRET` + fecha del día
4. El token expira al cambiar el día (gracia de 48h en torno a medianoche)
5. Si el mismo correo abre sesión en otro dispositivo, la sesión anterior se cierra automáticamente

### Roles

| Rol | Permisos |
|---|---|
| `usuario` | Ver dashboard, consultar coordenadas, descargar PDF |
| `admin` | Todo lo anterior + panel de gestión de usuarios + auditoría |

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `USUARIOS_DB` | JSON con la lista de usuarios `{ "usuarios": [...] }` |
| `ADMIN_SECRET` | Clave secreta para tokens HMAC (mínimo 32 caracteres) |
| `VERCEL_TOKEN` | Token API de Vercel para actualizar `USUARIOS_DB` desde el panel admin |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel |

```bash
# Generar ADMIN_SECRET seguro
openssl rand -hex 32
```

---

## Servidor HYSPLIT (autoalojado)

El módulo de simulación usa **NOAA HYSPLIT Ensemble** para predecir dispersión de humo desde un punto de ignición.

### Arquitectura
- **Frontend** (`js/humo.js`): interfaz, mapa de trayectorias y PDF
- **Backend** (`scripts/server.py`): Flask autoalojado con Docker, ejecuta HYSPLIT vía Selenium y transmite resultados por **SSE**

### Flujo
1. Usuario ingresa coordenadas (manual o long press sobre predio)
2. Cliente conecta al servidor vía SSE
3. Servidor ejecuta HYSPLIT Ensemble (~1-4 min) transmitiendo progreso
4. Trayectorias se renderizan como polilíneas coloreadas en el mapa

### Despliegue
```bash
docker build -t rdcft-backend .
docker run -d --name rdcft-backend --restart unless-stopped -p 8080:8080 rdcft-backend
```
Requiere nginx como proxy inverso con SSL (Let's Encrypt) y DuckDNS para IP dinámica.

---

## Automatización de precipitaciones

El script `scripts/descargar_precipitaciones.py` usa Selenium para descargar precipitaciones acumuladas desde [agrometeorologia.cl](https://www.agrometeorologia.cl) y actualiza `data/precipitaciones.json`.

El workflow `.github/workflows/precipitaciones.yml` lo ejecuta automáticamente cada **lunes a las 00:30 hora Chile**.

---

## Desarrollo local

```bash
git clone https://github.com/BlacKiller1/dashboard-rdcft.git
```

Crea `data/usuarios.json`:
```json
{
  "usuarios": [
    { "email": "tucorreo@arauco.com", "rol": "admin", "cargo": "Tu cargo" }
  ]
}
```

Abre `index.html` con **Live Server** en VS Code. El sistema detecta `file://` y usa archivos locales automáticamente.

Para el servidor HYSPLIT local:
```bash
pip install -r scripts/requirements.txt
python scripts/server.py
```

---

## Seguridad

| Capa | Medida |
|---|---|
| Autenticación | Verificación server-side; tokens HMAC con expiración diaria |
| Sesión única | Cierre automático si otra sesión activa es detectada |
| Autorización | Rol admin verificado en servidor antes de operaciones de escritura |
| XSS | `escapeHtml()` en toda salida de datos de usuario |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Service Worker | Nunca cachea `index.html` — CSP y autenticación siempre frescos |
| Datos | `data/usuarios.json` en `.gitignore`; producción solo en variables de entorno cifradas |

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
| Precipitación histórica | agrometeorologia.cl | mm |
| Trayectorias HYSPLIT | NOAA HYSPLIT Ensemble + GFS Global | — |

---

## Configuración operacional

```javascript
// js/weather.js — límite de viento para regla RDCFT
const VIENTO_LIMITE_RDCFT = 10; // km/h
```

- Agregar o editar paisajes → `js/paisajes.js`
- Cambiar URL del servidor HYSPLIT → `HUMO_BASE` en `js/humo.js` + `connect-src` en `vercel.json`

---

## Tecnologías

- HTML / CSS / JavaScript vanilla — sin frameworks frontend
- [Open-Meteo](https://open-meteo.com) — pronóstico meteorológico sin API key
- [Leaflet](https://leafletjs.com) — mapas interactivos (local)
- [html2canvas](https://html2canvas.hertzen.com) + [jsPDF](https://github.com/parallax/jsPDF) — exportación PDF (local)
- [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php) — modelo de dispersión
- Python + Flask + SSE — servidor de simulación
- Docker + nginx + Let's Encrypt + DuckDNS — servidor autoalojado con HTTPS
- Python + Selenium + pandas — descarga automática de precipitaciones
- Vercel Serverless Functions — API de autenticación
- GitHub Actions — automatización semanal + caché PWA

---

*Datos meteorológicos: [Open-Meteo](https://open-meteo.com) — CC BY 4.0*
*Precipitaciones: [agrometeorologia.cl](https://www.agrometeorologia.cl)*
*Dispersión de humo: [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php)*
