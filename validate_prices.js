#!/usr/bin/env node

/**
 * VALIDACIÓN DE PRECIOS
 * Verifica cuántas variantes activas no tienen ningún rango de precio en la BD.
 * Termina con exit code 1 si se supera el umbral aceptable.
 *
 * Usado como paso de validación en los workflows de GitHub Actions para alertar
 * sobre el problema "sin precio" desde el historial de ejecuciones fallidas.
 */

const Database = require('better-sqlite3');
const fs = require('fs');

// Umbral: si más del 5 % de las variantes activas no tienen precio, falla
const NO_PRICE_THRESHOLD_PCT = 5;

function validatePrices() {
  console.log('🔍 VALIDACIÓN DE PRECIOS');
  console.log('='.repeat(70));
  console.log(`Fecha: ${new Date().toISOString()}\n`);

  if (!fs.existsSync('./prices.db')) {
    console.log('❌ No se encontró prices.db');
    process.exit(1);
  }

  const db = new Database('./prices.db', { readonly: true });

  try {
    // Variantes activas (de productos no 404) sin ningún rango de precio
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT v.id) AS total_active_variants,
        COUNT(DISTINCT CASE WHEN pr.id IS NULL THEN v.id END) AS no_price_variants
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN price_ranges pr ON pr.variant_id = v.id
      WHERE p.status != '404' OR p.status IS NULL
    `).get();

    const total = stats.total_active_variants || 0;
    const noPrice = stats.no_price_variants || 0;
    const pct = total > 0 ? ((noPrice / total) * 100).toFixed(1) : '0.0';

    console.log(`📊 Variantes activas totales : ${total}`);
    console.log(`❌ Variantes sin precio      : ${noPrice} (${pct}%)`);
    console.log(`✅ Variantes con precio      : ${total - noPrice}`);
    console.log('');

    if (noPrice > 0) {
      // Listar las primeras 20 variantes sin precio para diagnóstico
      const samples = db.prepare(`
        SELECT p.url_base, v.variant_value, v.sku
        FROM variants v
        JOIN products p ON p.id = v.product_id
        LEFT JOIN price_ranges pr ON pr.variant_id = v.id
        WHERE (p.status != '404' OR p.status IS NULL) AND pr.id IS NULL
        LIMIT 20
      `).all();

      console.log('⚠️  Muestra de variantes sin precio (primeras 20):');
      samples.forEach((row, i) => {
        console.log(`  ${i + 1}. ${row.url_base}  →  variante: "${row.variant_value || 'base'}"  SKU: ${row.sku || 'N/A'}`);
      });
      console.log('');
    }

    const overThreshold = parseFloat(pct) > NO_PRICE_THRESHOLD_PCT;

    if (overThreshold) {
      console.log(`❌ FALLO: ${pct}% de variantes sin precio supera el umbral de ${NO_PRICE_THRESHOLD_PCT}%.`);
      console.log('   El scraper puede estar fallando al extraer precios del sitio.');
      console.log('   Revisa los logs del job de scraping para mensajes "⚠️  SIN PRECIO:".');
      db.close();
      process.exit(1);
    } else if (noPrice > 0) {
      console.log(`⚠️  ADVERTENCIA: ${noPrice} variante(s) sin precio (${pct}%), dentro del umbral aceptable de ${NO_PRICE_THRESHOLD_PCT}%.`);
    } else {
      console.log('✅ Todas las variantes activas tienen precio registrado.');
    }

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante validación:', error.message);
    db.close();
    process.exit(1);
  }
}

validatePrices();
