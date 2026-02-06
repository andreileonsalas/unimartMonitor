#!/usr/bin/env node

/**
 * REPORTE POST-SCRAPE: Análisis de productos nuevos/actualizados
 */

const Database = require('better-sqlite3');
const fs = require('fs');

function generateScrapeReport() {
  console.log('📊 REPORTE POST-SCRAPE: Resultados del Scraping');
  console.log('='.repeat(70));
  console.log(`Fecha: ${new Date().toISOString()}\n`);

  // Verificar si existe la base de datos
  if (!fs.existsSync('./prices.db')) {
    console.log('❌ No se encontró prices.db');
    return;
  }

  const db = new Database('./prices.db');

  try {
    // 1. Estadísticas generales
    console.log('📈 ESTADÍSTICAS GENERALES:');
    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT p.id) as total_products,
        COUNT(DISTINCT v.id) as total_variants,
        COUNT(DISTINCT pr.id) as total_prices,
        SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_products,
        SUM(CASE WHEN p.status = '404' THEN 1 ELSE 0 END) as deleted_products
      FROM products p
      LEFT JOIN variants v ON v.product_id = p.id
      LEFT JOIN prices pr ON pr.variant_id = v.id
    `).get();

    console.log(`   Total productos: ${stats.total_products}`);
    console.log(`   Total variantes: ${stats.total_variants}`);
    console.log(`   Total precios: ${stats.total_prices}`);
    console.log(`   Productos activos: ${stats.active_products}`);
    console.log(`   Productos 404: ${stats.deleted_products}`);
    console.log(`   Ratio variantes/producto: ${(stats.total_variants / stats.total_products).toFixed(2)}`);

    // 2. Productos actualizados recientemente (últimas 24 horas)
    console.log('\n🆕 PRODUCTOS ACTUALIZADOS (últimas 24 horas):');
    const recentUpdates = db.prepare(`
      SELECT COUNT(*) as count
      FROM products
      WHERE last_check >= datetime('now', '-24 hours')
    `).get();

    console.log(`   Productos checkeados: ${recentUpdates.count}`);

    // 3. Top 10 productos actualizados recientemente
    if (recentUpdates.count > 0) {
      console.log('\n   Top 10 más recientes:');
      const recent = db.prepare(`
        SELECT title, url_base, last_check, status
        FROM products
        WHERE last_check >= datetime('now', '-24 hours')
        ORDER BY last_check DESC
        LIMIT 10
      `).all();

      recent.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.title.substring(0, 50)}...`);
        console.log(`      Checked: ${p.last_check} | Status: ${p.status}`);
      });
    }

    // 4. Productos con múltiples variantes
    console.log('\n🎨 PRODUCTOS CON MÚLTIPLES VARIANTES:');
    const multiVariant = db.prepare(`
      SELECT p.title, p.url_base, COUNT(v.id) as variant_count
      FROM products p
      JOIN variants v ON v.product_id = p.id
      GROUP BY p.id
      HAVING variant_count > 1
      ORDER BY variant_count DESC
      LIMIT 10
    `).all();

    console.log(`   Total productos con múltiples variantes: ${multiVariant.length > 0 ? 'Encontrados' : 'Ninguno'}`);
    
    if (multiVariant.length > 0) {
      console.log('\n   Top 10 con más variantes:');
      multiVariant.forEach((p, idx) => {
        console.log(`   ${idx + 1}. ${p.title.substring(0, 50)}... (${p.variant_count} variantes)`);
      });
    } else {
      console.log('   ⚠️  ADVERTENCIA: Ningún producto tiene múltiples variantes');
      console.log('   Esto puede indicar un problema con el schema o el scraper');
    }

    // 5. Productos de prueba específicos
    console.log('\n🔍 PRODUCTOS DE PRUEBA:');
    const testProducts = [
      { name: 'Xiaomi Redmi Buds 6 Play', url: '%redmi-buds-6-play%' },
      { name: 'Xiaomi Redmi Buds 6 Active', url: '%redmi-buds-6-active%' },
      { name: 'Coby Freidora', url: '%coby%freidora%' }
    ];

    testProducts.forEach(test => {
      const product = db.prepare(`
        SELECT p.*, COUNT(v.id) as variant_count
        FROM products p
        LEFT JOIN variants v ON v.product_id = p.id
        WHERE p.url_base LIKE ?
        GROUP BY p.id
      `).get(test.url);

      if (product) {
        console.log(`\n   ✅ ${test.name}:`);
        console.log(`      Status: ${product.status}`);
        console.log(`      Last check: ${product.last_check || 'Never'}`);
        console.log(`      Variantes: ${product.variant_count}`);
        
        // Listar variantes
        const variants = db.prepare(`
          SELECT v.variant_value, v.sku, v.stock
          FROM variants v
          WHERE v.product_id = ?
        `).all(product.id);
        
        variants.forEach((v, idx) => {
          console.log(`         ${idx + 1}. ${v.variant_value} (SKU: ${v.sku}, Stock: ${v.stock || 'N/A'})`);
        });
      } else {
        console.log(`   ❌ ${test.name}: NO ENCONTRADO`);
      }
    });

    // 6. Variantes sin stock
    console.log('\n📦 ANÁLISIS DE STOCK:');
    const stockStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN stock IS NULL THEN 1 ELSE 0 END) as null_stock,
        SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as with_stock,
        SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as zero_stock
      FROM variants
    `).get();

    console.log(`   Total variantes: ${stockStats.total}`);
    console.log(`   Con stock: ${stockStats.with_stock} (${((stockStats.with_stock / stockStats.total) * 100).toFixed(1)}%)`);
    console.log(`   Sin stock (0): ${stockStats.zero_stock} (${((stockStats.zero_stock / stockStats.total) * 100).toFixed(1)}%)`);
    console.log(`   Stock NULL: ${stockStats.null_stock} (${((stockStats.null_stock / stockStats.total) * 100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Reporte completado\n');

  } catch (error) {
    console.error('❌ Error generando reporte:', error.message);
  } finally {
    db.close();
  }
}

generateScrapeReport();
