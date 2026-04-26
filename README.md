# Dashboard Meteorológico RDCFT — Arauco

Dashboard web interactivo para la toma de decisiones operacionales en **Optimización de Reducción de Combustible mediante Fuego Técnico (RDCFT)** en los Paisajes Productivos Protegidos de Arauco.

Desplegado en Vercel: [arauco-rdcft.vercel.app](https://arauco-rdcft.vercel.app)

---

## Funcionalidades

- **22 paisajes productivos** con coordenadas georeferenciadas
- **Pronóstico de 7 días** con datos horarios (10:00 / 15:00 / 18:00)
- **Regla RDCFT automática** — viento > 10 km/h bloquea la operación
- **Semáforo operacional** por día (Favorable / Con restricciones / No favorable)
- **Comentario operacional** generado automáticamente desde los datos meteorológicos
- **Consulta por coordenadas libres** — pronóstico horario para cualquier punto del mapa
- **Mapa interactivo** con capas de mapa oscuro, satélite y predios GeoJSON
- **Precipitaciones históricas** por estación vinculadas a cada paisaje
- **Exportación a PDF** por paisaje (una página, colores corporativos Arauco)
- **Modo oscuro / modo claro** con persistencia en `localStorage`
- **PWA** — instalable en dispositivos móviles con actualización automática de caché
- **Descarga automática de precipitaciones** vía script Python + Selenium cada lunes

---

## Autenticación y acceso

El acceso está restringido a correos `@arauco.com` registrados en la base de datos de usuarios.

### Flujo de login

1. El usuario ingresa su correo corporativo
2. El cliente envía el correo al endpoint `/api/verificar`
3. El servidor valida el correo contra `USUARIOS_DB` y emite un **token HMAC-SHA256 firmado** con `ADMIN_SECRET` + la fecha del día
4. El token expira automáticamente al cambiar el día (gracia de 48h para tokens en torno a medianoche)
5. Las operaciones de administración exigen el token en el header `Authorization`

### Roles

| Rol | Permisos |
|-----|----------|
| `usuario` | Ver dashboard, consultar coordenadas, descargar PDF |
| `admin` | Todo lo anterior + panel de gestión de usuarios |

### Panel de administración

Los administradores pueden agregar, eliminar y cambiar el rol de usuarios directamente desde el dashboard. Los cambios se persisten en la variable de entorno `USUARIOS_DB` de Vercel y activan un redeploy automático.

---

## Variables de entorno (Vercel)

| Variable | Descripción |
|----------|-------------|
| `USUARIOS_DB` | JSON con la lista de usuarios `{ "usuarios": [...] }` |
| `ADMIN_SECRET` | Clave secreta para firmar tokens HMAC (mínimo 32 caracteres aleatorios) |
| `VERCEL_TOKEN` | Token de API de Vercel para actualizar `USUARIOS_DB` vía panel admin |
| `VERCEL_PROJECT_ID` | ID del proyecto en Vercel |

Para generar un `ADMIN_SECRET` seguro:
```bash
openssl rand -hex 32
```

---

## Estructura del proyecto

```
dashboard-rdcft/
├── index.html                          — Estructura principal + login
├── css/
│   └── styles.css                      — Estilos, paleta visual, modo claro/oscuro
├── js/
│   ├── paisajes.js                     — Coordenadas y datos de los 22 paisajes
│   ├── weather.js                      — Integración Open-Meteo API + regla RDCFT
│   ├── ui.js                           — Renderizado, interacción y exportación PDF
│   ├── app.js                          — Controlador principal + toggle de tema
│   ├── login.js                        — Autenticación, sesión y panel de usuarios
│   └── map-picker.js                   — Mapa interactivo Leaflet + selector de coordenadas
├── api/
│   ├── verificar.js                    — POST: verifica correo y emite token firmado
│   ├── token.js                        — GET: retorna lista de usuarios (requiere auth admin)
│   └── usuarios.js                     — POST: actualiza usuarios y redespliega (requiere auth admin)
├── data/
│   ├── precipitaciones.json            — Precipitaciones históricas (actualización automática)
│   └── predios.geojson                 — Polígonos GeoJSON de predios Arauco
├── scripts/
│   └── descargar_precipitaciones.py    — Script Python para descarga automática
├── service-worker.js                   — PWA: caché de recursos estáticos
├── vercel.json                         — Configuración de despliegue + headers de seguridad
└── .github/
    └── workflows/
        ├── precipitaciones.yml         — Descarga automática cada lunes a las 00:30
        └── update-pwa-cache.yml        — Actualiza versión de caché PWA en cada push
```

> `data/usuarios.json` está en `.gitignore`. Solo se usa en desarrollo local como fuente de usuarios. En producción la fuente es la variable de entorno `USUARIOS_DB`.

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

---

## Despliegue en Vercel

1. Conecta el repositorio en [vercel.com](https://vercel.com)
2. Configura las variables de entorno (`USUARIOS_DB`, `ADMIN_SECRET`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`)
3. Cada push a `main` despliega automáticamente y actualiza la versión del caché PWA

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
| Autorización | Rol admin verificado en servidor antes de cualquier operación de escritura |
| XSS | `escapeHtml()` en toda salida de datos de usuario en el panel admin |
| Transporte | HTTPS forzado por Vercel; `Strict-Transport-Security` en CDN |
| Headers | CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` |
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

---

## Configuración operacional

Para ajustar el **límite de viento**, edita `js/weather.js`:

```javascript
const VIENTO_LIMITE_RDCFT = 10; // km/h
```

Para actualizar coordenadas o agregar paisajes, edita `js/paisajes.js`.

---

## Tecnologías

- HTML / CSS / JavaScript vanilla — sin frameworks
- [Open-Meteo API](https://open-meteo.com) — pronóstico meteorológico sin API key
- [Leaflet](https://leafletjs.com) — mapas interactivos
- [html2canvas](https://html2canvas.hertzen.com) + [jsPDF](https://github.com/parallax/jsPDF) — exportación PDF
- Python + Selenium + pandas — descarga automática de precipitaciones
- Vercel Serverless Functions — API de autenticación y gestión de usuarios
- GitHub Actions — automatización semanal + PWA cache

---

*Datos meteorológicos provistos por [Open-Meteo](https://open-meteo.com) bajo licencia CC BY 4.0*
*Datos de precipitaciones provistos por [agrometeorologia.cl](https://www.agrometeorologia.cl)*
