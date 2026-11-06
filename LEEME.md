# Kibian Extractos v0.5.0

Convertidor de extractos bancarios PDF a Excel/CSV. Todo corre en el navegador: los archivos nunca se suben.

## Planes

| | Gratis | Pase 30 días ($4.99, 30 días de acceso, no se renueva) | Pro anual ($39.99, suscripción) |
|---|---|---|---|
| Conversiones | Ilimitadas, de a un extracto | Ilimitadas | Ilimitadas |
| Movimientos en el archivo | Hasta 25 por extracto | Todos | Todos |
| Varios PDFs unidos en un Excel | No | Sí | Sí |
| Excel | Simple, con filtros y fila "Generado con Kibian Extractos" | Formato profesional con totales | Formato profesional con totales |
| Categorías y hoja Resumen | No | Sí | Sí |

## 1. Antes de publicar: editar `js/config.js`

- `checkoutPass` y `checkoutYearly`: links de pago de Lemon Squeezy.
- `contactEmail`: tu correo de soporte.
- `ownerName`, `ownerLocation`, `legalUpdated`, `refundDays`: datos que aparecen en Términos de uso y Política de privacidad.
- `lsProductIds`: ID del producto en Lemon Squeezy (`1496111`, con las variantes Pase 30 días y Pro anual). Así solo funcionan claves de este producto y no las de otros productos de la tienda.
- `freeRowsPerStatement`: tope de movimientos por extracto en el plan gratis (25).
- Precios mostrados (`pricePass`, `priceYearly`): deben coincidir con Lemon Squeezy.

## 2. Configurar Lemon Squeezy

1. **Pase 30 días:** producto de pago único ($4.99) que da 30 días de acceso, no de por vida. Activa **Generate license keys** y en la duración de la licencia pon **30 días** (license length / expires after). Así la clave vence sola.
2. **Pro anual:** producto de suscripción anual ($39.99) con **Generate license keys** activado. La licencia sigue válida mientras la suscripción esté activa.
3. Límite de activaciones en ambos: 2 (por ejemplo, oficina y casa).
4. Copia los links de checkout y los IDs de producto en `config.js`.
5. Haz una compra de prueba de cada uno (modo test de Lemon Squeezy) y activa la clave en la web.

## 3. Publicar en GitHub Pages

1. En GitHub (usuario FabianLasso3) crea un repositorio público llamado **kibian-extractos**.
2. Sube **el contenido** de esta carpeta (no la carpeta en sí): `index.html` debe quedar en la raíz del repositorio. Incluye el archivo oculto `.nojekyll`.
3. En el repositorio ve a **Settings → Pages**, en *Source* elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
4. En uno o dos minutos la web queda en **https://fabianlasso3.github.io/kibian-extractos/**.
5. Para actualizar, sube los archivos nuevos al repositorio (reemplazando los anteriores). No tiene límite de publicaciones como Netlify.

Si eliges otro nombre de repositorio, cambia la URL en los `<link rel="canonical">` de las tres páginas y en `cloudflare-worker/worker.js` si lo usas.

## 4. Licencias: prueba y puente opcional

GitHub Pages no tiene funciones de servidor. La web activa la licencia llamando directo a Lemon Squeezy desde el navegador. Haz una compra en Test mode y activa la clave:

- **Si funciona:** no hagas nada más.
- **Si falla** (mensaje "No pudimos conectar para validar la licencia"): crea el puente gratis en Cloudflare Workers:
  1. Entra a dash.cloudflare.com → **Workers & Pages** → **Create** → **Create Worker**, ponle un nombre (por ejemplo `kibian-licencias`) y **Deploy**.
  2. Toca **Edit code**, borra todo, pega el contenido de `cloudflare-worker/worker.js` y **Deploy**.
  3. Copia la URL del Worker (algo como `https://kibian-licencias.TU-USUARIO.workers.dev`) y pégala en `licenseProxy` dentro de `js/config.js`. Sube ese archivo de nuevo a GitHub.

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `index.html` | Landing + herramienta |
| `terminos.html` | Términos de uso |
| `privacidad.html` | Política de privacidad y tratamiento de datos (Ley 1581 de 2012) |
| `js/parser.js` | Lectura del PDF y reglas por banco (aquí se agregan bancos nuevos) |
| `js/app.js` | Planes, licencias, tabla y exportación a Excel/CSV |
| `js/config.js` | Precios, links de pago, IDs y correo |
| Etiqueta `Content-Security-Policy` en cada página | Seguridad: la página solo puede comunicarse con Lemon Squeezy (licencias), GoatCounter (visitas) y el puente opcional de Cloudflare |
| `js/analytics.js` | Eventos de interacción para GoatCounter |
| `cloudflare-worker/worker.js` | Puente opcional para validar licencias (solo recibe la clave) |
| `vendor/` y `fonts/` | pdf.js, ExcelJS y tipografía alojados localmente (sin CDNs de terceros) |

## Protección

- El tope gratis va en cada archivo (25 movimientos por extracto), no en el navegador: usar incógnito u otro navegador no lo salta. Los movimientos bloqueados no se muestran en pantalla, así que tampoco se pueden copiar de ahí.
- La licencia se valida contra Lemon Squeezy en cada visita; si no es válida o venció, se apaga. Sin internet se respeta la última validación hasta 7 días (`licenseOfflineGraceDays`), y un pase vencido se apaga igual por su fecha.

## Estadísticas (GoatCounter)

- El contador está en `vendor/count.js` (alojado en el propio sitio) y envía los datos a `https://kibianextractos.goatcounter.com`. Crea ese sitio en tu cuenta de GoatCounter con el código **kibianextractos**. Si usas otro código, cámbialo en `index.html`, `terminos.html` y `privacidad.html` (en el script y en la etiqueta Content-Security-Policy).
- Además de las visitas, se registran eventos de interacción (sin datos de los extractos): `archivo-elegido`, `conversion-ok-nequi-…`, `error-…`, `clave-pdf-pedida`, `descarga-excel-gratis/pago`, `descarga-csv-…`, `tope-gratis-mostrado`, `ver-ejemplo`, `ayuda-nequi`, `cta-convertir-…`, `ver-planes`, `vio-precios`, `vio-faq`, `faq-N`, `checkout-pase`, `checkout-anual`, `licencia-activada-…`, `licencia-error`, `voto-…`, `navegador-interno-tiktok/instagram/facebook`, `abrir-navegador`, `copiar-link`.
- Para separar campañas usa links con `?utm_source=tiktok&utm_campaign=nombre`.
- En GoatCounter, en la configuración del sitio, puedes agregar `fabianlasso3.github.io` como dominio del sitio.
