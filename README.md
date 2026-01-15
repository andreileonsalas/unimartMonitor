# Unimart Price Tracker 🏪📊

A lightweight price tracking application for unimart.com products, similar to CamelCamelCamel. This tool automatically monitors product prices daily and displays historical trends in your browser - no backend or authentication required!

## 🚀 Cómo Ver la Aplicación

### ⚠️ IMPORTANTE: Haz el Repositorio Público Primero

Para usar las opciones online (GitHub Pages, Netlify), necesitas hacer el repositorio público:

1. Ve a tu repositorio en GitHub: `https://github.com/andreileonsalas/unimartMonitor`
2. Click en **Settings** (⚙️)
3. Baja hasta el final de la página
4. En la sección "Danger Zone", click en **Change visibility**
5. Selecciona **Make public**
6. Confirma escribiendo el nombre del repositorio

**¿Por qué hacerlo público?**
- GitHub Pages gratis solo funciona con repos públicos
- Los datos ya son precios públicos de Unimart, no hay información sensible
- Te permite compartir la aplicación con otros sin necesidad de dar acceso al repo

---

### 🌐 Opción 1: GitHub Pages (RECOMENDADO - Sin instalar nada)

**⚠️ Primero: Haz merge del Pull Request a la rama `main`**

1. Ve a: `https://github.com/andreileonsalas/unimartMonitor/pulls`
2. Busca el Pull Request "Fix scraper reference error" (o similar)
3. Click en **"Merge pull request"**
4. Click en **"Confirm merge"**
5. Espera 30 segundos a que se complete el merge

**Luego, activa GitHub Pages:**

1. Ve a tu repositorio: `https://github.com/andreileonsalas/unimartMonitor`
2. Click en **Settings** (⚙️)
3. En el menú izquierdo, click en **Pages**
4. En "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: main
   - **Folder**: / (root)
5. Click en **Save**
6. Espera 1-2 minutos

**Tu aplicación estará disponible en:**
```
https://andreileonsalas.github.io/unimartMonitor/
```

✅ **Ventajas:**
- Acceso desde cualquier dispositivo con internet
- Se actualiza automáticamente cuando el GitHub Action actualiza los datos
- No necesitas instalar nada en tu computadora
- Es 100% GRATIS (no requiere pago)

### 🌍 Opción 2: Usando CDN (Funciona INMEDIATAMENTE después del merge)

**⚠️ Nota:** Estas URLs funcionarán automáticamente después de que hagas merge del PR a `main` (ver Opción 1).

Estas URLs funcionan sin necesidad de activar nada (solo copia y pega en tu navegador):

**Opción A - jsDelivr CDN (RECOMENDADO):**
```
https://cdn.jsdelivr.net/gh/andreileonsalas/unimartMonitor@main/index.html
```

**Opción B - RawCDN GitHack:**
```
https://rawcdn.githack.com/andreileonsalas/unimartMonitor/main/index.html
```

✅ **Ventajas:**
- Funciona INMEDIATAMENTE (no necesitas configurar GitHub Pages)
- Solo copia y pega la URL en tu navegador
- Se actualiza automáticamente con cada commit a `main`
- Gratis y sin configuración
- Súper rápido (usa CDN global)

⚠️ **Nota:** Estos servicios usan caché, así que los datos pueden tardar unos minutos en actualizarse después de que el GitHub Action corra.

### 🌍 Opción 3: Netlify Drop (Arrastra y suelta - MUY FÁCIL)

**✅ Funciona con repo público o privado**

1. Ve a [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Descarga estos 3 archivos de tu repositorio:
   - `index.html`
   - `viewer.js`
   - `prices.db`
3. Arrastra los 3 archivos a la zona de Netlify Drop
4. ¡Listo! Te dará una URL como: `https://random-name-123.netlify.app`

✅ **Ventajas:**
- Sin cuenta necesaria (modo anónimo)
- Súper rápido (arrastra y suelta)
- Gratis
- Funciona aunque el repo sea privado

⚠️ **Nota:** Para actualizar los datos, necesitas volver a subir el archivo `prices.db` actualizado.

### 📱 Opción 4: Directamente desde tu Navegador (Solo para probar)

1. **Descarga solo estos 3 archivos del repositorio:**
   - `index.html`
   - `viewer.js`
   - `prices.db`

2. **Abre `index.html` con tu navegador** (doble clic en el archivo)

⚠️ **Nota**: Algunos navegadores pueden bloquear la carga del archivo SQLite por seguridad. Si ves un error, usa una de las opciones con servidor.

### 💻 Opción 5: Con un Servidor Local (Para desarrollo)

Descarga el repositorio completo y usa cualquiera de estos métodos:

**A) Con Python (lo más simple - viene instalado en Mac/Linux):**
```bash
cd unimartMonitor
python -m http.server 8000
```
Luego abre en tu navegador: **http://localhost:8000**

**B) Con Visual Studio Code (súper fácil):**
1. Abre la carpeta `unimartMonitor` en VS Code
2. Instala la extensión "Live Server" (Ritwick Dey)
3. Clic derecho en `index.html` → "Open with Live Server"

**C) Con Node.js:**
```bash
npx http-server -p 8000
```
Luego abre: **http://localhost:8000**

### 🌐 Opción 6: En tu Servidor Web / Hosting

Si tienes un hosting con cPanel o FTP:

1. Sube estos 3 archivos a tu carpeta web (`public_html`, `www`, etc.):
   - `index.html`
   - `viewer.js`  
   - `prices.db`

2. Accede desde tu navegador: `http://tudominio.com/index.html`

3. Para actualizar precios: descarga el nuevo `prices.db` del repo y súbelo (cada vez que el GitHub Action lo actualice)

## 📸 Preview

![Unimart Price Tracker](https://github.com/user-attachments/assets/356c3b3a-a560-4088-9c20-be243f8eff19)

La aplicación muestra:
- 📊 Estadísticas totales (productos, registros, última actualización)
- 🔍 Buscador en tiempo real
- 💰 Precios actuales con moneda (CRC - Colones)
- 📈 Historial de cambios de precio al hacer clic en cada producto
- 🎨 Interfaz moderna y responsiva

## Features

- 📈 **Comprehensive Price Tracking**: Automatically scrapes prices from ALL ~38,000 products on unimart.com
- 🔄 **Incremental Scraping**: Processes products progressively over ~25 days to build complete database
- 💾 **SQLite Storage**: All data stored in a single SQLite file - no external database needed
- 🌐 **Browser-Based Viewer**: View price history directly in your browser using client-side SQLite
- 🤖 **Automated**: Runs daily via GitHub Actions - no server required
- 🔍 **Search & Filter**: Easily search through tracked products
- 📉 **Price History**: See how prices change over time for each product
- 🎨 **Beautiful UI**: Clean, modern interface with price change indicators
- ♻️ **Smart Deduplication**: Automatically handles products appearing in multiple sitemaps

## How It Works

1. **GitHub Actions** runs daily to:
   - Fetch the sitemap index from https://www.unimart.com/sitemap.xml (1,228 product sitemaps)
   - Process 100 sitemaps per run (~2,400 products)
   - Scrape 50 products per run with rate limiting
   - Use Set-based deduplication to avoid duplicate entries
   - Track progress in database to resume where it left off
   - Store data in SQLite database (`prices.db`)
   - Commit changes back to the repository
   - **Complete cycle**: ~25 days to scrape all products, then starts over to update prices

2. **Browser Viewer** (`index.html`):
   - Loads the SQLite database directly in your browser using sql.js
   - Displays all tracked products with current prices
   - Shows price trends and history
   - Fully client-side - no backend needed!

## Setup

### Prerequisites

- Node.js 20 or higher (requerido para el scraper)
- npm

### Installation

1. Clone this repository:
```bash
git clone https://github.com/andreileonsalas/unimartMonitor.git
cd unimartMonitor
```

2. Install dependencies:
```bash
npm install
```

### Running the Scraper

To run the scraper manually:

```bash
npm run scrape
```

This will:
- Fetch the sitemap from unimart.com
- Extract product URLs
- Scrape prices from up to 50 products
- Save data to `prices.db`

## 🤖 Automated Daily Tracking

Este proyecto usa **dos workflows automatizados** para optimizar el uso de minutos de GitHub Actions:

### 📅 Daily Scraper (Lunes-Sábado, 2 AM UTC)
**Archivo:** `.github/workflows/daily-scraper.yml`

Actualiza precios de productos activos:
- Scrapea solo productos con `status = 'active'` (no 404s)
- Límite: 5,000 productos/día
- **Modo:** `--mode=daily`
- **Objetivo:** Actualizar precios de productos conocidos
- **Tiempo estimado:** ~15 min/día

### 📆 Weekly Discovery (Domingos, 3 AM UTC)
**Archivo:** `.github/workflows/weekly-discovery.yml`

Descubre productos nuevos y recupera 404s:
- Descarga sitemaps completos (~76,000 URLs)
- Agrega URLs marcadas como 404 a la lista
- Merge automático con Set (deduplica URLs repetidas)
- **Modo:** `--mode=weekly`
- **Objetivo:** Descubrir nuevos productos + recuperar 404s que volvieron
- **Tiempo estimado:** ~50 min/semana

**📊 Log especial del merge:**
```
URLs from sitemap: 76809
URLs from 404s: 2401
Total unique URLs after merge: 79210
Duplicates removed: 0
```

### Ventajas de esta arquitectura:
- ✅ **Eficiencia:** Solo ~650 min/mes (32% del límite de 2000 min gratis)
- ✅ **Una sola recorrida semanal:** Sitemap + 404s se procesan juntos
- ✅ **Recuperación automática:** Si un producto vuelve del 404, se detecta
- ✅ **Actualización diaria:** Precios actualizados sin recorrer todo el sitemap

**Trigger manual:** Puedes ejecutar cualquier workflow manualmente desde GitHub:
- Ve a "Actions" tab en GitHub
- Selecciona "Daily Price Update" o "Weekly Discovery & Recovery"
- Clic en "Run workflow"

---

## 🔧 Para Desarrolladores

### Prerequisites

- Node.js 20 or higher (requerido para el scraper)
- npm

### Installation

1. Clone this repository:
```bash
git clone https://github.com/andreileonsalas/unimartMonitor.git
cd unimartMonitor
```

2. Install dependencies:
```bash
npm install
```

### Running the Scraper Locally

Puedes ejecutar el scraper en diferentes modos:

**Modo Weekly (sitemap + 404s):**
```bash
node scraper.js --mode=weekly
```
- Descarga todos los sitemaps
- Agrega URLs marcadas como 404
- Scrapea todo en una sola pasada
- **Uso:** Para descubrimiento completo

**Modo Daily (solo activos):**
```bash
node scraper.js --mode=daily
```
- Solo productos con `status='active'`
- Límite de 5,000 productos
- **Uso:** Actualización rápida de precios

**Modo Legacy (base de datos):**
```bash
node scraper.js --from-db
```
- Scrapea desde URLs en la DB (modo antiguo)
- Sin límite, ordena por `last_scraped`

### Database Migration

Si ya tienes una base de datos existente, ejecuta el script de migración:

```bash
node migrate_db.js
```

Esto agregará las nuevas columnas:
- `status` (TEXT): 'active' o '404'
- `last_check` (DATETIME): Última verificación

El script automáticamente:
- Detecta si la migración ya se hizo
- Marca productos con 404 basándose en `scraping_failures`
- Muestra estadísticas antes y después

## Database Schema

### Products Table
- `id`: Primary key
- `url_base`: Product base URL without parameters (unique identifier)
- `title`: Product title
- `status`: Product status ('active' or '404')
- `last_check`: Last check timestamp

### Variants Table
- `id`: Primary key
- `product_id`: Foreign key to products
- `url`: Full variant URL with parameters (e.g., ?Color=Rojo)
- `sku`: Variant-specific SKU from Unimart (indexed for fast search)
- `variant_label`: Type of variant (e.g., 'Color', 'Tamaño', 'Valor')
- `variant_value`: Specific value (e.g., 'Rojo', 'XL', '64GB')

**Note:** Products can have multiple variants (e.g., different colors). Each variant has its own SKU and price history.

### Prices Table
- `id`: Primary key
- `variant_id`: Foreign key to variants
- `price`: Product price
- `currency`: Currency code (CRC for Costa Rican Colón, USD, EUR, etc.)
- `scraped_at`: Timestamp of scrape

### Scraping State Table (New)
- `id`: Primary key (always 1)
- `last_sitemap_index`: Index of the last processed sitemap (0-1227)
- `total_sitemaps`: Total number of sitemaps (1228)
- `last_updated`: Last update timestamp

This table tracks scraping progress across runs, enabling the scraper to resume where it left off.

## Configuration

### Scraper Settings

The scraper now uses **incremental scraping** to process ALL products from Unimart over time:

Edit `scraper.js` to customize:

- **Products per run**: `const MAX_PRODUCTS_PER_RUN = 50;` - Number of products to scrape in each run
- **Sitemaps per run**: `const MAX_SITEMAPS_PER_RUN = 100;` - Number of sitemaps to fetch in each run  
- **Request delay**: `const REQUEST_DELAY_MS = 1000;` - Delay between product scrapes (milliseconds)
- **Sitemap delay**: `const SITEMAP_DELAY_MS = 500;` - Delay between sitemap fetches (milliseconds)

#### How Incremental Scraping Works

1. **Sitemap Processing**: There are 1,228 product sitemaps with ~38,000 total products
2. **Batch Processing**: Each run processes 100 sitemaps (~2,400 products)
3. **State Tracking**: Progress is saved in the database's `scraping_state` table
4. **Automatic Cycling**: After processing all 1,228 sitemaps, it starts over from the beginning
5. **Smart Prioritization**: New products are scraped first, then existing products are updated
6. **Deduplication**: Products appearing in multiple sitemaps are automatically deduplicated by URL

**Timeline**: With default settings (100 sitemaps/run, 50 products/run):
- Complete first pass: ~25 daily runs (~25 days)
- All 38,000+ products will be tracked
- Price history builds up over time for trend analysis

**Benefits**:
- ✅ Processes ALL products from the sitemap (not just 50)
- ✅ Respectful to Unimart's servers (rate limited)
- ✅ Builds comprehensive price history over time
- ✅ Automatic duplicate handling
- ✅ Resumes where it left off after each run

### Workflow Schedule

Edit `.github/workflows/scrape.yml` to change the schedule:

```yaml
schedule:
  - cron: '0 2 * * *'  # Runs daily at 2 AM UTC
```

## Technologies Used

- **Node.js**: Scraper runtime
- **Axios**: HTTP requests
- **Cheerio**: HTML parsing
- **xml2js**: Sitemap parsing
- **better-sqlite3**: SQLite database for Node.js
- **sql.js**: SQLite in the browser (WebAssembly)
- **GitHub Actions**: Automation
- **Vanilla JavaScript**: Browser viewer (no frameworks)

## Project Structure

```
unimartMonitor/
├── .github/
│   └── workflows/
│       └── scrape.yml          # GitHub Actions workflow
├── scraper.js                  # Main scraper script
├── index.html                  # Browser viewer UI
├── viewer.js                   # Browser viewer logic
├── prices.db                   # SQLite database (generated)
├── package.json                # Node.js dependencies
└── README.md                   # This file
```

## 🔧 Si Unimart Cambia su Estructura

### Edge Cases Verificados

✅ **Sitemap Index**: El sitemap principal tiene 1,245 sitemaps referenciados
✅ **Product Sitemaps**: Los primeros 1,228 contienen productos
✅ **Otros Sitemaps**: Los últimos son collections/articles/blogs (NO productos)
✅ **Estructura Uniforme**: Todos los product sitemaps tienen el mismo formato
✅ **Uso del Primero**: Es SEGURO usar solo el primer sitemap - no hay diferencias

### Dónde Hacer Cambios

#### 1. Si Cambia la URL del Sitemap

**Archivo**: `scraper.js` (línea 10)

```javascript
// 🔧 CAMBIAR AQUÍ si la URL del sitemap cambia
const SITEMAP_URL = 'https://www.unimart.com/sitemap.xml';
```

## TODO (para una IA que edite o mantenga el proyecto)

Breve checklist y contexto para que una IA (o nuevo desarrollador) entienda rápidamente qué hacer y pueda editar el scraper de forma segura:

- **Contexto del proyecto**: `scraper.js` descarga el `sitemap.xml`, extrae sitemaps de productos y scrapea páginas de productos, guardando resultados en `prices.db` (SQLite) usando `better-sqlite3`.
- **Dependencias clave**: `axios`, `cheerio`, `xml2js`, `better-sqlite3`.
- **Dónde comenzar**: revisar `scraper.js` — funciones importantes: `initDatabase()`, `fetchSitemap(db)`, `scrapeProduct(url)`, `saveProductPrice(db, productData)`, `main()`.

- **Qué necesita la IA para entender/editar correctamente**:
   - Conocer los selectores actuales de la página de producto (`h1`, `.money`, script JSON con `sku`) y cómo parsear precios/moneda.
   - Entender el esquema de la base de datos (tablas `products`, `prices`, `scraping_state`, `scraping_failures`, `sitemap_cache`).
   - Saber que `MAX_SITEMAPS_PER_RUN = 0` significa procesar todos los sitemaps en una sola ejecución.
   - Respetar los delays (`REQUEST_DELAY_MS`, `SITEMAP_DELAY_MS`) y los límites de concurrencia (`PARALLEL_REQUESTS`, `SITEMAP_PARALLEL_REQUESTS`) para evitar bloqueos.

- **Acciones seguras que puede automatizar la IA**:
   - Actualizar selectores de `scrapeProduct()` si la estructura HTML cambia.
   - Ajustar `PARALLEL_REQUESTS` y `REQUEST_DELAY_MS` si se observan bloqueos o lentitud.
   - Añadir reintentos/backoff en descargas fallidas (sitemaps y productos).
   - Añadir pruebas unitarias para parsing de precio/sku a partir de muestras HTML.

- **Acciones que requieren revisión humana**:
   - Cambios que impliquen almacenar nuevas columnas en `prices.db` o migraciones de esquema.
   - Políticas de eliminación de productos (por ejemplo, marcar productos como 'retirados' tras N errores 404).
   - Cambios que aumenten significativamente la carga sobre `unimart.com` (aumentar paralelismo sin pruebas).

- **Dónde buscar logs**:
   - `error.log` → errores acumulados (se imprimen al final de cada ejecución para CI).
   - Salida estándar (stdout) → progreso y `Cache HIT`/`Cache MISS` logs.

- **Prueba recomendada después de cambiar el scraper**:
   1. Ejecutar `node scraper.js` en modo corto (`MAX_SITEMAPS_PER_RUN = 5`) para validar parsing y logs.
   2. Revisar `error.log` y la tabla `scraping_failures` por fallos.
   3. Revisar `prices.db` con `find_product.js`.

Esta sección está pensada para que una IA pueda tener un checklist claro y actúe con cautela sobre los cambios que impactan datos o tráfico.

#### 2. Si Cambia la Estructura del Sitemap Index

**Archivo**: `scraper.js` (líneas 58-90)

```javascript
// 🔧 CAMBIAR AQUÍ si la estructura del sitemap index cambia
if (result.sitemapindex && result.sitemapindex.sitemap) {
  // Ajusta cómo se extraen las referencias a otros sitemaps
  const firstSitemapUrl = result.sitemapindex.sitemap[0].loc[0];
  // ...
}
```

#### 3. Si Cambia el Selector de Precio en la Página

**Archivo**: `scraper.js` (línea 165)

```javascript
// 🔧 CAMBIAR AQUÍ si el HTML de la página de producto cambia
// Actualmente el precio está en la clase .money
const priceText = $('.money').first().text().trim() ||
                $('.price').first().text() ||
                // Agrega nuevos selectores aquí
```

**Cómo verificar el nuevo selector:**
1. Abre una página de producto en unimart.com
2. Click derecho → "Inspeccionar elemento" en el precio
3. Encuentra la clase o ID del elemento
4. Actualiza el selector en el código

#### 4. Si Cambia el Formato del SKU

**Archivo**: `scraper.js` (línea 156)

```javascript
// 🔧 CAMBIAR AQUÍ si el formato del SKU en el JSON cambia
const skuMatch = content.match(/"sku"\s*:\s*"([^"]+)"/);
```

#### 5. Si Cambia el Símbolo de Moneda

**Archivo**: `scraper.js` (líneas 177-185)

```javascript
// 🔧 CAMBIAR AQUÍ si cambian de símbolo de moneda
if (priceText.includes('₡')) {
  currency = 'CRC';
} // Agrega nuevos símbolos aquí
```

### Herramientas para Debugging

```bash
# Ver la estructura del sitemap actual
curl https://www.unimart.com/sitemap.xml | head -100

# Ver el HTML de una página de producto
curl https://www.unimart.com/products/[nombre-producto] | grep -i "price\|money"

# Probar el scraper manualmente
npm run scrape
```

## Troubleshooting

### GitHub Pages or CDN URLs showing empty

If https://andreileonsalas.github.io/unimartMonitor/ or the CDN URLs show "0 products":

1. **Verify files are on main branch**: The files must be committed to the `main` branch for deployment
2. **Check database exists**: Ensure `prices.db` is committed and pushed to `main`
3. **Merge this PR**: This PR contains the fixes - merge it to `main` first
4. **Wait for deployment**: GitHub Pages can take 2-5 minutes to deploy after merging
5. **Hard refresh**: Press Ctrl+F5 (Windows/Linux) or Cmd+Shift+R (Mac) to clear cache
6. **Check browser console**: Open DevTools (F12) and look for any JavaScript errors
7. **Verify SQL.js loads**: The page needs to load SQL.js from CDN - check Network tab in DevTools

**Common issues**:
- **Database not on main**: Run the scraper and ensure the updated `prices.db` is on the `main` branch
- **CDN blocking**: Some ad blockers or privacy extensions may block CDN resources
- **Cache**: Browser cache may be showing old version - do a hard refresh
- **GitHub Pages not enabled**: Verify GitHub Pages is enabled in repository Settings → Pages

### Database not loading in browser
- Make sure you have run the scraper at least once
- Verify `prices.db` exists in the repository on the `main` branch  
- Check browser console for errors (F12 → Console tab)
- Try accessing the database directly: `https://andreileonsalas.github.io/unimartMonitor/prices.db`

### Scraper not finding products
- The product URL patterns may need adjustment
- Check if unimart.com's sitemap structure has changed
- Modify the URL filter logic in `scraper.js`
- Check the scraping_state table: `sqlite3 prices.db "SELECT * FROM scraping_state;"`

### Price extraction issues
- Product page HTML selectors may need updating
- Check the actual HTML structure of unimart.com product pages
- Adjust the selectors in the `scrapeProduct()` function

### Incremental scraping progress

To check scraping progress:

```bash
# Check how many products and prices are in the database
sqlite3 prices.db "SELECT COUNT(*) FROM products; SELECT COUNT(*) FROM prices;"

# Check scraping state (which sitemap we're on)
sqlite3 prices.db "SELECT * FROM scraping_state;"

# View recently added products
sqlite3 prices.db "SELECT title, price, currency FROM products p JOIN prices pr ON p.id = pr.product_id ORDER BY pr.scraped_at DESC LIMIT 10;"
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
