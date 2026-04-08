// merge_db.js
// Script para unificar múltiples bases de datos prices-*.db en una sola prices.db
// Evita duplicados y mantiene la estructura con price_ranges

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
  const dbExists = fs.existsSync(dbPath);
  
  if (dbExists) {
    console.log('📄 Preservando base de datos existente (modo incremental)...');
    const backupPath = path.join(__dirname, `prices.backup.${Date.now()}.db`);
    fs.copyFileSync(dbPath, backupPath);
    console.log(`💾 Backup creado: ${path.basename(backupPath)}`);
  } else {
    console.log('📄 Creando nueva base de datos...');
  }
  
  const db = new Database(dbPath);
  
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
      shopify_gid TEXT,
      stock INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS price_ranges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      price REAL,
      currency TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      FOREIGN KEY (variant_id) REFERENCES variants(id)
    );

    CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
    CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_ranges_variant_id ON price_ranges(variant_id);
    CREATE INDEX IF NOT EXISTS idx_price_ranges_open ON price_ranges(variant_id, end_date);
  `);
  
  return db;
}

function mergeDatabase(mainDb, segmentDbPath, segmentNumber) {
  console.log(`📄 Procesando segmento ${segmentNumber}: ${segmentDbPath}`);
  
  if (!fs.existsSync(segmentDbPath)) {
    console.log(`⚠️  Archivo no encontrado: ${segmentDbPath}`);
    return { products: 0, variants: 0, ranges: 0 };
  }
  
  const segmentDb = new Database(segmentDbPath, { readonly: true });
  
  try {
    let mergedStats = { products: 0, variants: 0, ranges: 0 };
    
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
    const findVariant = mainDb.prepare('SELECT id FROM variants WHERE product_id = ? AND url = ?');
    const insertVariant = mainDb.prepare(`
      INSERT INTO variants (product_id, url, sku, variant_label, variant_value, shopify_gid, stock)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const updateVariantSku = mainDb.prepare('UPDATE variants SET sku = ? WHERE id = ? AND sku IS NULL');
    const updateVariantStock = mainDb.prepare('UPDATE variants SET stock = ? WHERE id = ?');

    for (const variant of variants) {
      const mainProduct = findProduct.get(variant.url_base);
      if (!mainProduct) {
        console.log(`⚠️  Producto no encontrado para variante: ${variant.url_base}`);
        continue;
      }
      
      const existingVariant = findVariant.get(mainProduct.id, variant.url);
      if (!existingVariant) {
        insertVariant.run(
          mainProduct.id, variant.url, variant.sku,
          variant.variant_label, variant.variant_value,
          variant.shopify_gid,
          typeof variant.stock !== 'undefined' ? variant.stock : null
        );
        mergedStats.variants++;
      } else {
        if (variant.sku && !existingVariant.sku) {
          updateVariantSku.run(variant.sku, existingVariant.id);
        }
        updateVariantStock.run(
          typeof variant.stock !== 'undefined' ? variant.stock : null,
          existingVariant.id
        );
      }
    }
    
    // 3. Merge price_ranges con lógica de rangos
    // Detectar si el segmento usa price_ranges o prices (tabla legacy)
    const segTables = segmentDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const segHasRanges = segTables.includes('price_ranges');

    const findVariantByUrl = mainDb.prepare(`
      SELECT v.id FROM variants v
      JOIN products p ON v.product_id = p.id
      WHERE p.url_base = ? AND v.url = ?
    `);
    const findOpenRange = mainDb.prepare(
      'SELECT id, price FROM price_ranges WHERE variant_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1'
    );
    const closeRange = mainDb.prepare(
      'UPDATE price_ranges SET end_date = ? WHERE variant_id = ? AND end_date IS NULL'
    );
    const insertRange = mainDb.prepare(
      'INSERT INTO price_ranges (variant_id, price, currency, start_date, end_date) VALUES (?, ?, ?, ?, ?)'
    );

    if (segHasRanges) {
      // Segmento ya usa price_ranges: aplicar lógica de merge de rangos
      const segRanges = segmentDb.prepare(`
        SELECT pr.*, v.url as variant_url, p.url_base
        FROM price_ranges pr
        JOIN variants v ON pr.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        ORDER BY pr.start_date ASC
      `).all();

      for (const range of segRanges) {
        const mainVariant = findVariantByUrl.get(range.url_base, range.variant_url);
        if (!mainVariant) continue;

        const openRange = findOpenRange.get(mainVariant.id);
        if (!openRange) {
          // Sin rango previo: insertar tal cual
          insertRange.run(mainVariant.id, range.price, range.currency, range.start_date, range.end_date);
          mergedStats.ranges++;
        } else if (Math.abs(openRange.price - range.price) > 0.01) {
          // Precio distinto: cerrar rango anterior y abrir nuevo
          closeRange.run(range.start_date, mainVariant.id);
          insertRange.run(mainVariant.id, range.price, range.currency, range.start_date, range.end_date);
          mergedStats.ranges++;
        }
        // Si mismo precio y rango abierto: no hacer nada (sigue el mismo rango)
      }
    } else {
      // Segmento legacy con tabla prices: convertir al vuelo a rangos
      const segPrices = segmentDb.prepare(`
        SELECT pr.*, v.url as variant_url, p.url_base
        FROM prices pr
        JOIN variants v ON pr.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        ORDER BY pr.scraped_at ASC
      `).all();

      for (const price of segPrices) {
        const mainVariant = findVariantByUrl.get(price.url_base, price.variant_url);
        if (!mainVariant) continue;

        const today = price.scraped_at ? price.scraped_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
        const openRange = findOpenRange.get(mainVariant.id);
        if (!openRange) {
          insertRange.run(mainVariant.id, price.price, price.currency, today, null);
          mergedStats.ranges++;
        } else if (Math.abs(openRange.price - price.price) > 0.01) {
          closeRange.run(today, mainVariant.id);
          insertRange.run(mainVariant.id, price.price, price.currency, today, null);
          mergedStats.ranges++;
        }
      }
    }
    
    console.log(`  ✓ Merged: ${mergedStats.products} productos, ${mergedStats.variants} variantes, ${mergedStats.ranges} rangos`);
    return mergedStats;
    
  } finally {
    segmentDb.close();
  }
}

async function main() {
  console.log('🔄 Iniciando merge de bases de datos segmentadas...\n');
  
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
  
  const mainDb = initMergedDatabase();
  
  const existingProducts = mainDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const existingVariants = mainDb.prepare('SELECT COUNT(*) as count FROM variants').get().count;  
  const existingRanges = mainDb.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  
  if (existingProducts > 0) {
    console.log(`📊 Datos existentes ANTES del merge:`);
    console.log(`   Productos: ${existingProducts.toLocaleString()}`);
    console.log(`   Variantes: ${existingVariants.toLocaleString()}`);
    console.log(`   Rangos de precio: ${existingRanges.toLocaleString()}\n`);
  }
  
  let totalStats = { products: 0, variants: 0, ranges: 0 };
  
  for (const segmentInfo of segmentDatabases) {
    const segmentPath = path.join(__dirname, segmentInfo.file);
    const stats = mergeDatabase(mainDb, segmentPath, segmentInfo.segment);
    totalStats.products += stats.products;
    totalStats.variants += stats.variants;
    totalStats.ranges += stats.ranges;
  }
  
  console.log('\n=== Resumen del Merge ===');
  const finalProducts = mainDb.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const finalVariants = mainDb.prepare('SELECT COUNT(*) as count FROM variants').get().count;
  const finalRanges = mainDb.prepare('SELECT COUNT(*) as count FROM price_ranges').get().count;
  
  console.log(`📊 Total en prices.db:`);
  console.log(`   Productos: ${finalProducts.toLocaleString()}`);
  console.log(`   Variantes: ${finalVariants.toLocaleString()}`);
  console.log(`   Rangos de precio: ${finalRanges.toLocaleString()}`);
  
  if (existingProducts > 0) {
    console.log(`\n📈 Incremento en este merge:`);
    console.log(`   +${(finalProducts - existingProducts).toLocaleString()} productos`);
    console.log(`   +${(finalVariants - existingVariants).toLocaleString()} variantes`);
    console.log(`   +${(finalRanges - existingRanges).toLocaleString()} rangos`);
  }
  
  const dbSizeMB = (fs.statSync(path.join(__dirname, 'prices.db')).size / (1024*1024)).toFixed(1);
  console.log(`   Tamaño: ${dbSizeMB} MB`);
  
  mainDb.close();
  
  console.log('\n🧹 Limpiando archivos de segmentos...');
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
  
  const backupFiles = fs.readdirSync(__dirname)
    .filter(file => file.startsWith('prices.backup.') && file.endsWith('.db'))
    .sort()
    .reverse();
  if (backupFiles.length > 3) {
    console.log('\n🧹 Limpiando backups antiguos...');
    for (let i = 3; i < backupFiles.length; i++) {
      try {
        fs.unlinkSync(path.join(__dirname, backupFiles[i]));
        console.log(`   ✓ Backup antiguo eliminado: ${backupFiles[i]}`);
      } catch (e) {
        // Ignorar errores de limpieza
      }
    }
  }
  
  console.log(`\n✅ Merge completado! ${deletedFiles}/${segmentDatabases.length} archivos de segmentos eliminados.`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { findSegmentDatabases, mergeDatabase };
