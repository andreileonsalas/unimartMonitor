// merge_db.js
// Script para unificar múltiples bases de datos prices-*.db en una sola prices.db
// Evita duplicados y mantiene la estructura original

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function findSegmentDatabases() {
  const files = fs.readdirSync(__dirname);
  const segmentDbs = files
    .filter(file => file.match(/^prices-\d+\.db$/))
    .map(file => ({
      file: file,
      segment: parseInt(file.match(/prices-(\d+)\.db/)[1])
    }))
    .sort((a, b) => a.segment - b.segment);
  
  return segmentDbs;
}

function initMergedDatabase() {
  const dbPath = path.join(__dirname, 'prices.db');
  const db = new Database(dbPath);
  
  // Crear tablas si no existen (misma estructura que scraper.js)
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_base TEXT UNIQUE NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'active',
      last_check DATETIME
    );
    CREATE TABLE IF NOT EXISTS variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      url TEXT UNIQUE NOT NULL,
      sku TEXT,
      variant_label TEXT,
      variant_value TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );
    
    -- Índices para mejorar performance
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
    CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_prices_variant_id ON prices(variant_id);
  `);
  
  return db;
}

function mergeDatabase(mainDb, segmentDbPath, segmentNumber) {
  console.log(`📄 Procesando segmento ${segmentNumber}: ${segmentDbPath}`);
  
  if (!fs.existsSync(segmentDbPath)) {
    console.log(`⚠️  Archivo no encontrado: ${segmentDbPath}`);
    return { products: 0, variants: 0, prices: 0 };
  }
  
  const segmentDb = new Database(segmentDbPath, { readonly: true });
  
  try {
    let mergedStats = { products: 0, variants: 0, prices: 0 };
    
    // 1. Merge productos con UPSERT
    const products = segmentDb.prepare('SELECT * FROM products').all();
    const upsertProduct = mainDb.prepare(`
      INSERT INTO products (url_base, title, status, last_check)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(url_base) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        last_check = excluded.last_check
    `);
    
    for (const product of products) {
      upsertProduct.run(product.url_base, product.title, product.status, product.last_check);
      mergedStats.products++;
    }
    
    // 2. Merge variantes evitando duplicados
    const variants = segmentDb.prepare(`
      SELECT v.*, p.url_base 
      FROM variants v 
      JOIN products p ON v.product_id = p.id
    `).all();
    
    const findProduct = mainDb.prepare('SELECT id FROM products WHERE url_base = ?');
    const findVariant = mainDb.prepare(`
      SELECT id FROM variants 
      WHERE product_id = ? AND url = ?
    `);
    const insertVariant = mainDb.prepare(`
      INSERT INTO variants (product_id, url, sku, variant_label, variant_value)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateVariantSku = mainDb.prepare('UPDATE variants SET sku = ? WHERE id = ? AND sku IS NULL');
    
    for (const variant of variants) {
      const mainProduct = findProduct.get(variant.url_base);
      if (!mainProduct) {
        console.log(`⚠️  Producto no encontrado para variante: ${variant.url_base}`);
        continue;
      }
      
      const existingVariant = findVariant.get(mainProduct.id, variant.url);
      if (!existingVariant) {
        // Nueva variante
        insertVariant.run(
          mainProduct.id,
          variant.url,
          variant.sku,
          variant.variant_label,
          variant.variant_value
        );
        mergedStats.variants++;
      } else if (variant.sku && !existingVariant.sku) {
        // Actualizar SKU si está vacío
        updateVariantSku.run(variant.sku, existingVariant.id);
      }
    }
    
    // 3. Merge precios evitando duplicados temporales
    const prices = segmentDb.prepare(`
      SELECT pr.*, v.url as variant_url, p.url_base
      FROM prices pr
      JOIN variants v ON pr.variant_id = v.id
      JOIN products p ON v.product_id = p.id
    `).all();
    
    const findVariantByUrl = mainDb.prepare(`
      SELECT v.id FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE p.url_base = ? AND v.url = ?
    `);
    const insertPrice = mainDb.prepare(`
      INSERT INTO prices (variant_id, price, currency, scraped_at)
      VALUES (?, ?, ?, ?)
    `);
    
    for (const price of prices) {
      const mainVariant = findVariantByUrl.get(price.url_base, price.variant_url);
      if (mainVariant) {
        insertPrice.run(
          mainVariant.id,
          price.price,
          price.currency,
          price.scraped_at
        );
        mergedStats.prices++;
      }
    }
    
    console.log(`  ✓ Merged: ${mergedStats.products} productos, ${mergedStats.variants} variantes, ${mergedStats.prices} precios`);
    return mergedStats;
    
  } finally {
    segmentDb.close();
  }
}

async function main() {
  console.log('🔄 Iniciando merge de bases de datos segmentadas...\n');
  
  // Buscar todas las bases de datos de segmentos
  const segmentDatabases = findSegmentDatabases();
  
  if (segmentDatabases.length === 0) {
    console.log('⚠️  No se encontraron bases de datos de segmentos (prices-*.db)');
    console.log('   Si solo hay un runner, no es necesario hacer merge.');
    return;
  }
  
  console.log(`📋 Encontradas ${segmentDatabases.length} bases de datos de segmentos:`);
  segmentDatabases.forEach(db => {
    const sizeMB = (fs.statSync(db.file).size / (1024*1024)).toFixed(1);
    console.log(`   ${db.file} (${sizeMB} MB)`);
  });
  console.log();
  
  // Inicializar base de datos principal
  const mainDb = initMergedDatabase();
  
  // Merge cada segmento
  let totalStats = { products: 0, variants: 0, prices: 0 };
  
  for (const segmentInfo of segmentDatabases) {
    const segmentPath = path.join(__dirname, segmentInfo.file);
    const stats = mergeDatabase(mainDb, segmentPath, segmentInfo.segment);
    
    totalStats.products += stats.products;
    totalStats.variants += stats.variants;
    totalStats.prices += stats.prices;
  }
  
  // Estadísticas finales
  console.log('\\n=== Resumen del Merge ===');
  const finalProducts = mainDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const finalVariants = mainDb.prepare('SELECT COUNT(*) as count FROM variants').get().count;
  const finalPrices = mainDb.prepare('SELECT COUNT(*) as count FROM prices').get().count;
  
  console.log(`📊 Total en prices.db:`);
  console.log(`   Productos: ${finalProducts}`);
  console.log(`   Variantes: ${finalVariants}`);
  console.log(`   Precios: ${finalPrices}`);
  
  const dbSizeMB = (fs.statSync(path.join(__dirname, 'prices.db')).size / (1024*1024)).toFixed(1);
  console.log(`   Tamaño: ${dbSizeMB} MB`);
  
  mainDb.close();
  
  // Limpiar archivos de segmentos
  console.log('\\n🧹 Limpiando archivos de segmentos...');
  let deletedFiles = 0;
  for (const segmentInfo of segmentDatabases) {
    try {
      fs.unlinkSync(segmentInfo.file);
      console.log(`   ✓ Eliminado: ${segmentInfo.file}`);
      deletedFiles++;
    } catch (e) {
      console.log(`   ❌ Error eliminando ${segmentInfo.file}: ${e.message}`);
    }
  }
  
  console.log(`\\n✅ Merge completado! ${deletedFiles}/${segmentDatabases.length} archivos de segmentos eliminados.`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { findSegmentDatabases, mergeDatabase };