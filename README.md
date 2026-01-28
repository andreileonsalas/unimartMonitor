# Unimart Price Tracker 🏪📊

Monitor de precios automático para productos de unimart.com. Similar a CamelCamelCamel - trackea precios diariamente y muestra tendencias históricas. 100% gratis, sin backend ni autenticación.

## 🚀 Acceso Rápido

**Opción 1: GitHub Pages** (Recomendado - sin instalar nada)
```
https://andreileonsalas.github.io/unimartMonitor/
```

**Opción 2: CDN** (Funciona inmediatamente)
```
https://cdn.jsdelivr.net/gh/andreileonsalas/unimartMonitor@main/index.html
```

⚠️ **Nota**: El repositorio debe ser público para GitHub Pages/CDN. Los datos son precios públicos de Unimart.

---

## 🎯 Uso Rápido (Cheatsheet)

### Para Usuarios (GitHub Actions)

**Scrapear URLs específicas** (productos nuevos no en sitemap):
1. Ve a **Actions** → **Manual URL Scraper**
2. Click **Run workflow**
3. Pega URL(s) del producto
4. Click **Run workflow**
5. Espera 2-3 min → ¡Listo!

### Para Desarrolladores (Local)

```bash
# Instalar
git clone https://github.com/andreileonsalas/unimartMonitor.git
cd unimartMonitor
npm install

# Scraping
npm run scrape:daily          # Actualizar precios (rápido)
npm run scrape:weekly         # Descubrir nuevos productos (completo)

# Manual scraping
node scraper.js --mode=manual --url="https://www.unimart.com/products/..."
node scraper.js --mode=manual --urls-file=my-urls.txt  # Create file with URLs first

# Tests
npm test

# Ver datos localmente
python3 -m http.server 8000   # Luego abre http://localhost:8000
```

---

## 📊 Cómo Funciona

### Arquitectura
1. **Scraper** (Node.js): Descarga sitemap → Extrae productos → Guarda en SQLite
2. **Database** (SQLite): 3 tablas (products, variants, prices)
3. **Viewer** (JavaScript): Lee DB en el browser → Muestra gráficos

### Workflows Automáticos (GitHub Actions)
- **Daily** (Lun-Sáb 2 AM UTC): Actualiza precios de productos activos
- **Weekly** (Dom 3 AM UTC): Descubre nuevos productos del sitemap
- **Manual**: On-demand para URLs específicas

### Manejo de 404s
**Importante**: El scraper detecta productos eliminados:
- Si un producto retorna 404 → marca `status='404'` en DB
- Daily scraper **NO** procesa productos con status 404
- Weekly scraper puede re-descubrir productos (si vuelven al sitemap)
- Manual scraping puede intentar recuperar 404s específicos

Código relevante:
```javascript
// Si detecta 404, marca en DB y NO scrapea
if (e.response && e.response.status === 404) {
  db.prepare(`UPDATE products SET status='404', last_check=datetime('now') WHERE url_base=?`).run(url);
}

// Daily scraper excluye 404s
const products = db.prepare('SELECT url_base FROM products WHERE status != "404"').all();
```

---

## 📦 Database Schema

### Products Table
- `id`: Primary key
- `url_base`: URL sin parámetros (unique)
- `title`: Título del producto
- `status`: 'active' o '404'
- `last_check`: Última verificación

### Variants Table
- `id`: Primary key
- `product_id`: FK → products
- `url`: URL completa con parámetros (ej: ?Color=Rojo)
- `sku`: SKU de Unimart (indexed)
- `variant_label`: Tipo (ej: 'Color', 'Tamaño')
- `variant_value`: Valor (ej: 'Rojo', 'XL')
- `shopify_gid`: ID de Shopify (opcional)
- `stock`: Cantidad disponible (opcional)

### Prices Table
- `id`: Primary key
- `variant_id`: FK → variants
- `price`: Precio numérico
- `currency`: Moneda (CRC, USD, etc.)
- `scraped_at`: Timestamp

**Nota**: Un producto puede tener múltiples variantes (colores, tamaños). Cada variante tiene su propio historial de precios.

---

## ⚙️ Configuración

### Cambiar Número de Workers Paralelos

**Por defecto**: 8 workers paralelos

Para cambiar (ej: a 20 workers):

**1. `.github/workflows/daily-scraper.yml`**
```yaml
segment: [1, 2, 3, ..., 20]  # Lista de 1 a 20
--segments=20 --segment=${{ matrix.segment }}
```

**2. `.github/workflows/weekly-discovery.yml`**
```yaml
segment: [1, 2, 3, ..., 20]  # Lista de 1 a 20
--segments=20 --segment=${{ matrix.segment }}
```

**3. `package.json`**
```json
"scrape:daily:segments": "for /L %i in (1,1,20) do ...",
"scrape:weekly:segments": "for /L %i in (1,1,20) do ...",
```

**Performance**:
- 1 worker: ~6-8 horas (baseline)
- 8 workers: ~45-60 min (6x más rápido) ← default
- 20 workers: ~20-30 min (15x más rápido)

---

## 🔧 Troubleshooting

### Viewer muestra "0 productos"
1. Verificar `prices.db.gz` está en rama `main`
2. Hard refresh: Ctrl+F5 (Win/Linux) o Cmd+Shift+R (Mac)
3. Revisar consola del browser (F12) por errores JavaScript
4. Verificar que SQL.js se carga desde CDN (pestaña Network)

### Scraper no encuentra productos
1. Verificar si sitemap de Unimart cambió: `curl https://www.unimart.com/sitemap.xml`
2. Usar manual scraping para productos específicos
3. Verificar DB: `sqlite3 prices.db "SELECT COUNT(*) FROM products;"`

### Producto específico no aparece
**Causa común**: Producto agregado a sitemap DESPUÉS del último weekly run
**Solución**: Usar manual scraping (Actions → Manual URL Scraper)

---

## 🛠️ Para Desarrolladores

### Estructura del Proyecto
```
unimartMonitor/
├── .github/workflows/
│   ├── daily-scraper.yml       # Daily price updates
│   ├── weekly-discovery.yml    # Weekly sitemap discovery
│   └── manual-scraper.yml      # Manual URL scraping
├── scraper.js                  # Main scraper
├── index.html                  # Browser UI
├── viewer.js                   # Browser logic
├── prices.db.gz                # Compressed database
└── package.json                # Dependencies
```

### Funciones Principales (scraper.js)
- `initDatabase()`: Crea/inicializa SQLite DB
- `fetchProductSitemaps()`: Obtiene lista de sitemaps
- `fetchSitemapUrls(url)`: Extrae URLs de un sitemap
- `scrapeAndSave(db, url)`: Scrapea producto y guarda en DB
- `detectVariants(url)`: Detecta variantes del producto
- `scrapeSimpleProduct(url)`: Extrae precio de la página
- `main()`: Orquesta todo el proceso

### Modificar Scraper si Unimart Cambia

**Selector de precio** (scraper.js ~línea 390):
```javascript
// Selector actual
const priceText = $('.money').first().text().trim()

// Si cambia, actualizar aquí
```

**URL del sitemap** (scraper.js ~línea 45):
```javascript
const SITEMAP_INDEX_URL = 'https://www.unimart.com/sitemap.xml';
```

### Testing
Después de cualquier cambio:
```bash
npm test                    # 26 tests deben pasar
node scraper.js --mode=manual --url="https://..."  # Test manual
```

---

## 📚 Tech Stack

- **Scraper**: Node.js 20+, Axios, Cheerio, xml2js
- **Database**: SQLite (better-sqlite3), comprimida con gzip
- **Viewer**: Vanilla JavaScript, SQL.js (WebAssembly), Bootstrap 5
- **CI/CD**: GitHub Actions (8 workers paralelos)

---

## 📝 License

MIT
