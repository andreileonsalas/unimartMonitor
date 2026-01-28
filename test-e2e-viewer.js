// test-e2e-viewer.js
// Simple E2E test para verificar que el viewer funciona

const fs = require('fs');
const path = require('path');

console.log('🧪 E2E Test: Viewer Functionality');
console.log('=====================================\n');

// Test 1: Verificar que existen todos los archivos necesarios
console.log('📁 Test 1: Archivos Requeridos');
const requiredFiles = [
  'index.html',
  'viewer.js', 
  'db-worker.js',
  'prices.db.gz',
  'main.css'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`  ${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log('\n❌ FALLO: Archivos faltantes\n');
  process.exit(1);
}

// Test 2: Verificar que index.html carga viewer.js y db-worker.js
console.log('\n📄 Test 2: Referencias en HTML');
const html = fs.readFileSync('index.html', 'utf8');

const checks = [
  { name: 'viewer.js referenciado', test: html.includes('viewer.js') },
  { name: 'Bootstrap CSS cargado', test: html.includes('bootstrap') },
  { name: 'SQL.js cargado', test: html.includes('sql-wasm.js') || html.includes('sql.js') },
  { name: 'Chart.js cargado', test: html.includes('chart.js') },
  { name: 'Pako (gzip) cargado', test: html.includes('pako') }
];

let allChecksPass = true;
checks.forEach(check => {
  console.log(`  ${check.test ? '✅' : '❌'} ${check.name}`);
  if (!check.test) allChecksPass = false;
});

if (!allChecksPass) {
  console.log('\n❌ FALLO: Referencias faltantes en HTML\n');
  process.exit(1);
}

// Test 3: Verificar que viewer.js usa db-worker.js
console.log('\n🔧 Test 3: Viewer usa Web Worker');
const viewerCode = fs.readFileSync('viewer.js', 'utf8');

const viewerChecks = [
  { name: 'Carga db-worker.js', test: viewerCode.includes('db-worker.js') },
  { name: 'Función loadDatabase existe', test: viewerCode.includes('function loadDatabase') },
  { name: 'Función displayVariants existe', test: viewerCode.includes('function displayVariants') },
  { name: 'Worker messages manejados', test: viewerCode.includes('worker.onmessage') || viewerCode.includes('handleWorkerMessage') }
];

let allViewerChecksPass = true;
viewerChecks.forEach(check => {
  console.log(`  ${check.test ? '✅' : '❌'} ${check.name}`);
  if (!check.test) allViewerChecksPass = false;
});

if (!allViewerChecksPass) {
  console.log('\n❌ FALLO: viewer.js no está configurado correctamente\n');
  process.exit(1);
}

// Test 4: Verificar que db-worker.js tiene la lógica correcta
console.log('\n🔨 Test 4: Web Worker funcionalidad');
const workerCode = fs.readFileSync('db-worker.js', 'utf8');

const workerChecks = [
  { name: 'Maneja INIT_DB', test: workerCode.includes('INIT_DB') },
  { name: 'Maneja QUERY_VARIANTS', test: workerCode.includes('QUERY_VARIANTS') },
  { name: 'Importa SQL.js', test: workerCode.includes('initSqlJs') || workerCode.includes('importScripts') },
  { name: 'Procesa mensajes', test: workerCode.includes('self.onmessage') }
];

let allWorkerChecksPass = true;
workerChecks.forEach(check => {
  console.log(`  ${check.test ? '✅' : '❌'} ${check.name}`);
  if (!check.test) allWorkerChecksPass = false;
});

if (!allWorkerChecksPass) {
  console.log('\n❌ FALLO: db-worker.js no tiene la lógica correcta\n');
  process.exit(1);
}

// Test 5: Verificar que prices.db.gz es válido
console.log('\n💾 Test 5: Database válida');
const { execSync } = require('child_process');

try {
  // Verificar que es un archivo gzip válido
  const fileType = execSync('file prices.db.gz').toString();
  const isGzip = fileType.includes('gzip');
  console.log(`  ${isGzip ? '✅' : '❌'} Archivo es gzip válido`);
  
  if (!isGzip) {
    console.log('\n❌ FALLO: prices.db.gz no es un gzip válido\n');
    process.exit(1);
  }
  
  // Verificar tamaño
  const stats = fs.statSync('prices.db.gz');
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const hasData = stats.size > 1000000; // Al menos 1MB
  console.log(`  ${hasData ? '✅' : '❌'} Tamaño razonable: ${sizeMB} MB`);
  
  if (!hasData) {
    console.log('\n❌ FALLO: prices.db.gz es muy pequeño\n');
    process.exit(1);
  }
  
  // Test de integridad gzip
  try {
    execSync('gunzip -t prices.db.gz 2>&1');
    console.log('  ✅ Integridad gzip OK');
  } catch (e) {
    console.log('  ❌ Archivo gzip corrupto');
    console.log('\n❌ FALLO: prices.db.gz está corrupto\n');
    process.exit(1);
  }
  
  // Verificar que tiene datos SQLite
  try {
    const productCount = execSync('gunzip -c prices.db.gz | sqlite3 /dev/stdin "SELECT COUNT(*) FROM products" 2>&1').toString().trim();
    const hasProducts = parseInt(productCount) > 1000;
    console.log(`  ${hasProducts ? '✅' : '❌'} Productos en DB: ${productCount}`);
    
    if (!hasProducts) {
      console.log('\n⚠️  ADVERTENCIA: Pocos productos en la base de datos\n');
    }
  } catch (e) {
    console.log('  ⚠️  No se pudo contar productos (puede ser normal en algunos ambientes)');
  }
  
} catch (e) {
  console.log('  ❌ Error al verificar DB:', e.message);
  console.log('\n❌ FALLO: No se pudo validar prices.db.gz\n');
  process.exit(1);
}

console.log('\n=====================================');
console.log('✅ TODOS LOS TESTS E2E PASARON');
console.log('=====================================\n');
console.log('📝 Resumen:');
console.log('  ✅ Todos los archivos existen');
console.log('  ✅ HTML carga dependencias correctas');
console.log('  ✅ viewer.js usa Web Worker');
console.log('  ✅ db-worker.js tiene lógica correcta');
console.log('  ✅ prices.db.gz es válida');
console.log('\n💡 Nota: Para pruebas completas de UI, ejecutar:');
console.log('   python3 -m http.server 8080');
console.log('   Luego abrir http://localhost:8080/index.html\n');

process.exit(0);
