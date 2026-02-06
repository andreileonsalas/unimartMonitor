#!/usr/bin/env node

/**
 * REPORTE PRE-SCRAPE: Lista productos del sitemap antes del scraping
 */

const axios = require('axios');
const xml2js = require('xml2js');

const SITEMAP_INDEX_URL = 'https://www.unimart.com/sitemap.xml';

async function fetchProductSitemaps() {
  try {
    const res = await axios.get(SITEMAP_INDEX_URL, { timeout: 20000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(res.data);
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      return result.sitemapindex.sitemap
        .map(s => s.loc[0])
        .filter(url => url.includes('/products/'));
    }
    return [];
  } catch (e) {
    console.error('Error fetching sitemap index:', e.message);
    return [];
  }
}

async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await axios.get(sitemapUrl, { timeout: 15000 });
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(res.data);
    if (result.urlset && result.urlset.url) {
      return result.urlset.url.map(entry => entry.loc[0]);
    }
    return [];
  } catch (e) {
    console.error('Error fetching sitemap:', sitemapUrl, e.message);
    return [];
  }
}

async function generateSitemapReport() {
  console.log('📋 REPORTE PRE-SCRAPE: Productos en Sitemap');
  console.log('='.repeat(70));
  console.log(`Fecha: ${new Date().toISOString()}\n`);

  // 1. Obtener sitemaps
  console.log('🗺️  PASO 1: Obteniendo lista de sitemaps...');
  const sitemaps = await fetchProductSitemaps();
  console.log(`   ✅ Total sitemaps de productos: ${sitemaps.length}\n`);

  // 2. Contar productos totales
  console.log('📦 PASO 2: Contando productos en sitemaps...');
  let totalProducts = 0;
  const sitemapCounts = [];

  for (let i = 0; i < Math.min(sitemaps.length, 10); i++) {
    const sitemap = sitemaps[i];
    const urls = await fetchSitemapUrls(sitemap);
    totalProducts += urls.length;
    sitemapCounts.push({ sitemap, count: urls.length });
  }

  console.log(`   ✅ Primeros 10 sitemaps contienen: ${totalProducts} productos`);
  console.log(`   📊 Estimación total: ~${Math.round((totalProducts / 10) * sitemaps.length)} productos\n`);

  // 3. Muestra de primeros sitemaps
  console.log('📊 PASO 3: Detalle de primeros sitemaps:');
  sitemapCounts.forEach((item, idx) => {
    const sitemapNum = item.sitemap.match(/\/products\/(\d+)\.xml/);
    console.log(`   ${idx + 1}. Sitemap ${sitemapNum ? sitemapNum[1] : '?'}: ${item.count} productos`);
  });

  // 4. Buscar productos específicos de prueba
  console.log('\n🔍 PASO 4: Buscando productos de prueba...');
  const testProducts = [
    'xiaomi-audifonos-inalambricos-redmi-buds-6-play',
    'xiaomi-audifonos-inalambricos-redmi-buds-6-active',
    'coby-freidora'
  ];

  for (const testProduct of testProducts) {
    console.log(`\n   Buscando: ${testProduct}`);
    let found = false;
    
    for (const sitemap of sitemaps) {
      try {
        const urls = await fetchSitemapUrls(sitemap);
        const match = urls.find(url => url.includes(testProduct));
        if (match) {
          const sitemapNum = sitemap.match(/\/products\/(\d+)\.xml/);
          console.log(`   ✅ ENCONTRADO en sitemap ${sitemapNum ? sitemapNum[1] : '?'}`);
          console.log(`      URL: ${match}`);
          found = true;
          break;
        }
      } catch (e) {
        // Continue to next sitemap
      }
    }
    
    if (!found) {
      console.log(`   ❌ NO encontrado en ningún sitemap`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Reporte completado\n');
  console.log('💡 Este reporte se ejecuta ANTES del scraping para verificar');
  console.log('   qué productos están disponibles en los sitemaps.\n');
}

generateSitemapReport().catch(console.error);
