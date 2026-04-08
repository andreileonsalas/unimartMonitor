#!/usr/bin/env node
/**
 * migrate_to_ranges.js
 * 
 * Migra la tabla `prices` (schema clásico, un registro por día) a `price_ranges`
 * (schema nuevo, un registro por rango de precio continuo).
 * 
 * Proceso:
 *   1. Crea la tabla price_ranges si no existe.
 *   2. Por cada variante, ordena sus precios por fecha y colapsa días
 *      consecutivos con el mismo precio en un único rango.
 *   3. Deja la tabla `prices` intacta (no la elimina) para que `archive/`
 *      siga funcionando con la DB original.
 * 
 * Uso:
 *   node decompress_db.js
 *   node migrate_to_ranges.js
 *   node compress_db.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'prices.db');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ prices.db no encontrada. Ejecuta primero: node decompress_db.js');
  process.exit(1);
}

console.log('='.repeat(70));
console.log('🔄 MIGRACIÓN: prices → price_ranges');
console.log('='.repeat(70));

const db = new Database(DB_PATH);

// Verificar que existe la tabla prices
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
if (!tables.includes('prices')) {
  console.log('✅ No existe tabla prices – nada que migrar (ya usa price_ranges).');
  db.close();
  process.exit(0);
}

// Contar registros a migrar
const totalPrices = db.prepare('SELECT COUNT(*) as c FROM prices').get().c;
const totalVariants = db.prepare('SELECT COUNT(DISTINCT variant_id) as c FROM prices').get().c;
console.log(`\n📊 Registros en prices: ${totalPrices.toLocaleString()}`);
console.log(`   Variantes con historial: ${totalVariants.toLocaleString()}`);

if (totalPrices === 0) {
  console.log('\n⚠️  Tabla prices vacía. Sin datos que migrar.');
  db.close();
  process.exit(0);
}

// Crear tabla price_ranges si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS price_ranges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    price      REAL,
    currency   TEXT,
    start_date TEXT NOT NULL,
    end_date   TEXT,
    FOREIGN KEY (variant_id) REFERENCES variants(id)
  );
  CREATE INDEX IF NOT EXISTS idx_price_ranges_variant_id ON price_ranges(variant_id);
  CREATE INDEX IF NOT EXISTS idx_price_ranges_open ON price_ranges(variant_id, end_date);
`);

// Verificar si ya hay datos en price_ranges (migración parcial)
const existingRanges = db.prepare('SELECT COUNT(*) as c FROM price_ranges').get().c;
if (existingRanges > 0) {
  console.log(`\n⚠️  price_ranges ya tiene ${existingRanges.toLocaleString()} registros.`);
  console.log('   Limpiando para re-migrar desde cero...');
  db.exec('DELETE FROM price_ranges');
}

// Obtener todas las variantes con historial
const variantIds = db.prepare('SELECT DISTINCT variant_id FROM prices ORDER BY variant_id').all().map(r => r.variant_id);

console.log('\n⏳ Migrando...');

const insertRange = db.prepare(
  'INSERT INTO price_ranges (variant_id, price, currency, start_date, end_date) VALUES (?, ?, ?, ?, ?)'
);

let totalRangesCreated = 0;
let processedVariants = 0;

// Envolver todo en una sola transacción para velocidad
const migrate = db.transaction(() => {
  for (const variantId of variantIds) {
    // Obtener historial ordenado por fecha
    const rows = db.prepare(
      'SELECT price, currency, scraped_at FROM prices WHERE variant_id = ? ORDER BY scraped_at ASC'
    ).all(variantId);

    if (rows.length === 0) continue;

    let rangeStart = rows[0].scraped_at.slice(0, 10);
    let rangePrice = rows[0].price;
    let rangeCurrency = rows[0].currency || 'CRC';
    let rangeEnd = rows[0].scraped_at.slice(0, 10);

    for (let i = 1; i < rows.length; i++) {
      const day = rows[i].scraped_at.slice(0, 10);
      const price = rows[i].price;
      const currency = rows[i].currency || 'CRC';

      if (Math.abs(price - rangePrice) < 0.01) {
        // Mismo precio: extender el rango
        rangeEnd = day;
      } else {
        // Precio cambió: cerrar rango actual
        insertRange.run(variantId, rangePrice, rangeCurrency, rangeStart, rangeEnd);
        totalRangesCreated++;
        // Iniciar nuevo rango
        rangeStart = day;
        rangePrice = price;
        rangeCurrency = currency;
        rangeEnd = day;
      }
    }

    // Cerrar el último rango (end_date = NULL → precio activo)
    insertRange.run(variantId, rangePrice, rangeCurrency, rangeStart, null);
    totalRangesCreated++;
    processedVariants++;

    // Mostrar progreso cada 500 variantes
    if (processedVariants % 500 === 0) {
      process.stdout.write(`\r   ${processedVariants}/${variantIds.length} variantes procesadas...`);
    }
  }
});

migrate();

console.log(`\r   ${processedVariants}/${variantIds.length} variantes procesadas.   `);

// Estadísticas finales
const finalRanges = db.prepare('SELECT COUNT(*) as c FROM price_ranges').get().c;
const compressionRatio = totalPrices > 0 ? ((1 - finalRanges / totalPrices) * 100).toFixed(1) : 0;

console.log('\n' + '='.repeat(70));
console.log('✅ MIGRACIÓN COMPLETADA');
console.log('='.repeat(70));
console.log(`   Registros originales (prices):   ${totalPrices.toLocaleString()}`);
console.log(`   Rangos creados (price_ranges):   ${finalRanges.toLocaleString()}`);
console.log(`   Reducción:                       ${compressionRatio}%`);
console.log('\n💡 La tabla prices se mantiene intacta para compatibilidad con archive/');
console.log('   Puedes eliminarla manualmente una vez verificado el funcionamiento.');
console.log('\nSiguiente paso: node compress_db.js');

db.close();
