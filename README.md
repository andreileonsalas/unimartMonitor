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

- 📈 **Daily Price Tracking**: Automatically scrapes prices from unimart.com using GitHub Actions
- 💾 **SQLite Storage**: All data stored in a single SQLite file - no external database needed
- 🌐 **Browser-Based Viewer**: View price history directly in your browser using client-side SQLite
- 🤖 **Automated**: Runs daily via GitHub Actions - no server required
- 🔍 **Search & Filter**: Easily search through tracked products
- 📉 **Price History**: See how prices change over time for each product
- 🎨 **Beautiful UI**: Clean, modern interface with price change indicators

## How It Works

1. **GitHub Actions** runs daily to:
   - Fetch the sitemap from https://www.unimart.com/sitemap.xml
   - Extract product URLs
   - Scrape current prices
   - Store data in SQLite database (`prices.db`)
   - Commit changes back to the repository

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

The GitHub Actions workflow (`.github/workflows/scrape.yml`) runs automatically every day at 2 AM UTC. It will:

1. Install dependencies
2. Run the scraper
3. Commit the updated database
4. Push changes to the repository

**Trigger manual:** Puedes ejecutarlo manualmente desde GitHub:
- Ve a "Actions" tab en GitHub
- Selecciona "Daily Price Scraper"
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

To run the scraper manually:

```bash
npm run scrape
```

This will:
- Fetch the sitemap from unimart.com
- Extract product URLs
- Scrape prices from up to 50 products
- Save data to `prices.db`

The GitHub Actions workflow (`.github/workflows/scrape.yml`) runs automatically every day at 2 AM UTC. It will:

1. Install dependencies
2. Run the scraper
3. Commit the updated database
4. Push changes to the repository

You can also trigger it manually:
- Go to "Actions" tab in GitHub
- Select "Daily Price Scraper"
- Click "Run workflow"

## Database Schema

### Products Table
- `id`: Primary key
- `url`: Product URL (unique identifier)
- `sku`: Product SKU from Unimart (indexed for fast search)
- `title`: Product title
- `last_scraped`: Last scrape timestamp

**Note:** Both URL and SKU are stored to maintain dual reference. If Unimart changes the URL or SKU, historical data is preserved.

### Prices Table
- `id`: Primary key
- `product_id`: Foreign key to products
- `price`: Product price
- `currency`: Currency code (CRC for Costa Rican Colón, USD, EUR, etc.)
- `scraped_at`: Timestamp of scrape

## Configuration

### Scraper Settings

Edit `scraper.js` to customize:

- **Product limit**: Change `const MAX_PRODUCTS_PER_RUN = 50;` to scrape more/fewer products per run
- **Delay**: Adjust `const REQUEST_DELAY_MS = 1000;` to change delay between requests (in milliseconds)
- **URL filters**: The scraper automatically filters for `/products/` URLs from Unimart

### Workflow Schedule

Edit `.github/workflows/scrape.yml` to change the schedule:

```yaml
schedule:
  - cron: '0 2 * * *'  # Change this line
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

### Database not loading in browser
- Make sure you have run the scraper at least once
- Verify `prices.db` exists in the repository
- Check browser console for errors

### Scraper not finding products
- The product URL patterns may need adjustment
- Check if unimart.com's sitemap structure has changed
- Modify the URL filter logic in `scraper.js`

### Price extraction issues
- Product page HTML selectors may need updating
- Check the actual HTML structure of unimart.com product pages
- Adjust the selectors in the `scrapeProduct()` function

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
