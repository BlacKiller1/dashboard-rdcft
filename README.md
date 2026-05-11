# Dashboard Meteorológico RDCFT — Arauco

Dashboard web interactivo para la toma de decisiones operacionales en **Optimización de Reducción de Combustible mediante Fuego Técnico (RDCFT)** en los Paisajes Productivos Protegidos de Arauco.

Desplegado en Vercel: [arauco-rdcft.vercel.app](https://arauco-rdcft.vercel.app)

---

## Funcionalidades

### Pronóstico meteorológico
- **22 paisajes productivos** con coordenadas georeferenciadas
- **Pronóstico de 7 días** con datos horarios (10:00 / 15:00 / 18:00)
- **Regla RDCFT automática** — viento > 10 km/h bloquea la operación
- **Semáforo operacional** por día (Favorable / Con restricciones / No favorable)
- **Comentario operacional** generado automáticamente desde los datos meteorológicos
- **Consulta por coordenadas libres** — pronóstico horario para cualquier punto del mapa
- **Precipitaciones históricas** por estación vinculadas a cada paisaje
- **Exportación a PDF** por paisaje (layout portrait estilo Arauco, colores corporativos)

### Mapa interactivo
- **Mapa interactivo** con capas de mapa oscuro, satélite y predios GeoJSON
- **Capa de predios Arauco** — polígonos GeoJSON convertidos desde Esri JSON UTM-18S a WGS84
- **Long press sobre predios** — captura automática de coordenadas para simulación de humo

### Simulación de dispersión de humo (HYSPLIT)
- **Simulación HYSPLIT Ensemble** (NOAA) ejecutada en servidor propio desplegado en **Railway** con Docker
- **Trayectorias visualizadas directamente en el mapa** — capas de polilíneas por ensemble
- **Botón Limpiar** para resetear el mapa tras la simulación
- **Health check automático** con indicador de estado del servidor (oculto hasta primer check)
- **Streaming SSE** para evitar timeouts en Railway durante simulaciones largas
- **Informe PDF de simulación** (en proceso de elaboración) — layout portrait con mapa, coordenadas, rosa de vientos y comentarios operacionales
- **Auto-generación de comentarios** de viento y condiciones de quema en el informe PDF

### Autenticación y sesión
- **Login restringido** a correos `@arauco.com` registrados en la base de datos
- **Cierre de sesión automático** cuando la cuenta es iniciada en otro dispositivo (sesión única activa)
- **Formulario de solicitud de acceso** visible desde la pantalla de login
- **Botón "Solicitar acceso"** siempre visible para usuarios sin cuenta

### General
- **Modo oscuro / modo claro** con persistencia en `localStorage`
- **PWA** — instalable en dispositivos móviles con actualización automática de caché
- **Descarga automática de precipitaciones** vía script Python + Selenium cada lunes
- **Librerías vendor locales** (html2canvas, jsPDF, Leaflet) — sin dependencia de CDNs externos

---

## Autenticación y acceso

El acceso está restringido a correos `@arauco.com` registrados en la base de datos de usuarios.

### Flujo de login

1. El usuario ingresa su correo corporativo
2. El cliente envía el correo al endpoint `/api/verificar`
3. El servidor valida el correo contra `USUARIOS_DB` y emite un **token HMAC-SHA256 firmado** con `ADMIN_SECRET` + la fecha del día
4. El token expira automáticamente al cambiar el día (gracia de 48h para tokens en torno a medianoche)
5. Si el mismo correo inicia sesión en otro dispositivo, la sesión anterior se cierra automáticamente
6. Las operaciones de administración exigen el token en el header `Authorization`

### Roles

| Rol | Permisos |
|-----|----------|
| `usuario` | Ver dashboard, consultar coordenadas, descargar PDF |
| `admin` | Todo lo anterior + panel de gestión de usuarios |

### Panel de administración

Los administradores pueden agregar, eliminar y cambiar el rol de usuarios directamente desde el dashboard. Los cambios se persisten en la variable de entorno `USUARIOS_DB` de Vercel y activan un redeploy automático.

---

## Variables de entorno

### Vercel (frontend + API)

| Variable | Descripción |
|----------|-------------|
| `USUARIOS_DB` | JSON con la lista de usuarios `{ "usuarios": [...] }` |
| `ADMIN_SECRET` | Clave secreta para firmar tokens HMAC (mínimo 32 caracteres aleatorios) |
| `VERCEL_TOKEN` | Token de API de Vercel para actualizar `USUARIOS_DB` vía panel admin |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel |

### Railway (servidor HYSPLIT)

| Variable | Descripción |
|----------|-------------|
| `HUMO_BASE` | URL base del servidor Railway (ej: `https://mi-servidor.railway.app`) |

Para generar un `ADMIN_SECRET` seguro:
```bash
openssl rand -hex 32
```

---

## Estructura del proyecto

```
dashboard-rdcft/
├── index.html                          — Estructura principal + login + modal PDF humo
├── css/
│   └── styles.css                      — Estilos, paleta visual, modo claro/oscuro
├── js/
│   ├── paisajes.js                     — Coordenadas y datos de los 22 paisajes
│   ├── weather.js                      — Integración Open-Meteo API + regla RDCFT
│   ├── ui.js                           — Renderizado, interacción y exportación PDF
│   ├── app.js                          — Controlador principal + toggle de tema
│   ├── login.js                        — Autenticación, sesión única y panel de usuarios
│   ├── map-picker.js                   — Mapa interactivo Leaflet + selector de coordenadas
│   └── humo.js                         — Simulación HYSPLIT, mapa de trayectorias y PDF
├── api/
│   ├── verificar.js                    — POST: verifica correo y emite token firmado
│   ├── token.js                        — GET: retorna lista de usuarios (requiere auth admin)
│   └── usuarios.js                     — POST: actualiza usuarios y redespliega (requiere auth admin)
├── data/
│   ├── precipitaciones.json            — Precipitaciones históricas (actualización automática)
│   └── predios.geojson                 — Polígonos GeoJSON de predios Arauco (WGS84)
├── scripts/
│   └── descargar_precipitaciones.py    — Script Python para descarga automática
├── vendor/                             — Librerías locales (html2canvas, jsPDF, Leaflet)
├── service-worker.js                   — PWA: caché de recursos estáticos (nunca cachea index.html)
├── vercel.json                         — Configuración de despliegue + headers de seguridad + CSP
├── Dockerfile                          — Imagen Docker para servidor HYSPLIT en Railway
├── server.py                           — Servidor Flask con SSE para simulación HYSPLIT
└── .github/
    └── workflows/
        ├── precipitaciones.yml         — Descarga automática cada lunes a las 00:30
        └── update-pwa-cache.yml        — Actualiza versión de caché PWA en cada push
```

> `data/usuarios.json` está en `.gitignore`. Solo se usa en desarrollo local como fuente de usuarios. En producción la fuente es la variable de entorno `USUARIOS_DB`.

---

## Simulación de dispersión de humo (HYSPLIT)

El módulo de simulación usa el modelo **NOAA HYSPLIT Ensemble** para predecir la dispersión de humo desde un punto de ignición.

### Arquitectura

- **Frontend** (`js/humo.js`): interfaz de usuario, mapa de trayectorias y generación de PDF
- **Backend** (`server.py`): servidor Flask desplegado en Railway con Docker, ejecuta HYSPLIT y transmite resultados vía **Server-Sent Events (SSE)**
- **CSP**: `vercel.json` incluye la URL de Railway en `connect-src`

### Flujo de simulación

1. El usuario ingresa coordenadas (manualmente o por long press sobre un predio)
2. El cliente envía la solicitud al servidor Railway via SSE
3. El servidor ejecuta HYSPLIT Ensemble y transmite el progreso en tiempo real
4. Al finalizar, las trayectorias se renderizan como polilíneas coloreadas en el mapa
5. El mapa ajusta la vista a las trayectorias (zoom regional máximo)

### Informe PDF (en proceso de elaboración)

El botón de generación de informe PDF está habilitado solo tras una simulación exitosa. El informe incluye: mapa de trayectorias, coordenadas, fecha, comentarios de viento y condiciones de quema auto-generados.

---

## Desarrollo local

1. Clona el repositorio:
   ```bash
   git clone https://github.com/BlacKiller1/dashboard-rdcft.git
   ```
2. Crea `data/usuarios.json` con al menos un usuario admin:
   ```json
   {
     "usuarios": [
       { "email": "tucorreo@arauco.com", "rol": "admin", "cargo": "Tu cargo" }
     ]
   }
   ```
3. Abre con **Live Server** en VS Code (clic derecho sobre `index.html` → *Open with Live Server*), o ábrelo directamente con doble clic — el sistema detecta `file://` y usa los archivos locales automáticamente.

Para el servidor HYSPLIT en local, instala las dependencias de Python y ejecuta `server.py` directamente.

---

## Despliegue

### Vercel (frontend)

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Configura las variables de entorno (`USUARIOS_DB`, `ADMIN_SECRET`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`)
3. Cada push a `main` despliega automáticamente y actualiza la versión del caché PWA

### Railway (servidor HYSPLIT)

1. Conecta el repositorio en [railway.app](https://railway.app)
2. Railway detecta el `Dockerfile` y construye la imagen automáticamente
3. Configura la variable `HUMO_BASE` en Vercel con la URL pública asignada por Railway

---

## Automatización de precipitaciones

El script `scripts/descargar_precipitaciones.py` usa **Selenium + Chrome headless** para descargar los datos de precipitaciones acumuladas de la semana anterior desde [agrometeorologia.cl](https://www.agrometeorologia.cl) y actualiza `data/precipitaciones.json`.

### Ejecución manual

```bash
pip install selenium webdriver-manager pandas openpyxl requests
python scripts/descargar_precipitaciones.py
```

### Ejecución automática

El workflow `.github/workflows/precipitaciones.yml` ejecuta el script cada **lunes a las 00:30 hora Chile** y valida que el JSON generado sea correcto antes de hacer commit.

---

## Seguridad

| Capa | Medida |
|------|--------|
| Autenticación | Verificación server-side en `/api/verificar`; tokens HMAC con expiración diaria |
| Sesión única | Cierre automático si otra sesión activa es detectada en un dispositivo diferente |
| Autorización | Rol admin verificado en servidor antes de cualquier operación de escritura |
| XSS | `escapeHtml()` en toda salida de datos de usuario en el panel admin |
| Transporte | HTTPS forzado por Vercel; `Strict-Transport-Security` en CDN |
| Headers | CSP (incluye Railway en `connect-src`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` |
| Service Worker | Nunca cachea `index.html` — garantiza que el CSP y la lógica de autenticación sean siempre frescos |
| Datos | `data/usuarios.json` en `.gitignore`; usuarios en producción solo en variables de entorno cifradas |

---

## Variables meteorológicas

| Variable | Fuente | Unidad |
|----------|--------|--------|
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

Para ajustar el **límite de viento**, edita `js/weather.js`:

```javascript
const VIENTO_LIMITE_RDCFT = 10; // km/h
```

Para actualizar coordenadas o agregar paisajes, edita `js/paisajes.js`.

Para cambiar la URL del servidor HYSPLIT, actualiza la variable de entorno `HUMO_BASE` en Vercel.

---

## Tecnologías

- HTML / CSS / JavaScript vanilla — sin frameworks
- [Open-Meteo API](https://open-meteo.com) — pronóstico meteorológico sin API key
- [Leaflet](https://leafletjs.com) — mapas interactivos (servido localmente)
- [html2canvas](https://html2canvas.hertzen.com) + [jsPDF](https://github.com/parallax/jsPDF) — exportación PDF (servido localmente)
- [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php) — modelo de dispersión de trayectorias
- Python + Flask + SSE — servidor de simulación HYSPLIT
- Docker + Railway — despliegue del servidor HYSPLIT en la nube
- Python + Selenium + pandas — descarga automática de precipitaciones
- Vercel Serverless Functions — API de autenticación y gestión de usuarios
- GitHub Actions — automatización semanal + PWA cache

---

*Datos meteorológicos provistos por [Open-Meteo](https://open-meteo.com) bajo licencia CC BY 4.0*
*Datos de precipitaciones provistos por [agrometeorologia.cl](https://www.agrometeorologia.cl)*
*Modelo de dispersión: [NOAA HYSPLIT](https://www.ready.noaa.gov/HYSPLIT.php)*
