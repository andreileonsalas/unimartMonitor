// test_segments.js
// Script para probar la funcionalidad de segmentación localmente

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runSegment(segment, totalSegments, mode = 'daily') {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Iniciando segmento ${segment}/${totalSegments} (${mode})`);
    
    const args = [
      'scraper.js',
      `--mode=${mode}`,
      `--segments=${totalSegments}`,
      `--segment=${segment}`
    ];
    
    const child = spawn('node', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Mostrar solo líneas importantes para evitar spam
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.includes('SEGMENTACIÓN') || 
            line.includes('Procesando segmento') || 
            line.includes('PROGRESO') || 
            line.includes('Total precios') ||
            line.includes('=== Resumen ===') ||
            line.includes('Scraping completo')) {
          console.log(`[${segment}] ${line}`);
        }
      });
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Segmento ${segment} completado`);
        resolve({ segment, success: true, output });
      } else {
        console.log(`❌ Segmento ${segment} falló con código ${code}`);
        console.log(`Error: ${errorOutput}`);
        reject({ segment, success: false, error: errorOutput, code });
      }
    });
  });
}

async function runMerge() {
  return new Promise((resolve, reject) => {
    console.log('\n🔄 Iniciando merge de bases de datos...');
    
    const child = spawn('node', ['merge_db.js'], {
      stdio: 'inherit',
      cwd: __dirname
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Merge completado');
        resolve();
      } else {
        console.log(`❌ Merge falló con código ${code}`);
        reject(code);
      }
    });
  });
}

function cleanup() {
  // Limpiar archivos de prueba
  const files = fs.readdirSync(__dirname);
  files.forEach(file => {
    if (file.match(/^prices-\d+\.db$/)) {
      try {
        fs.unlinkSync(file);
        console.log(`🗑️ Eliminado: ${file}`);
      } catch (e) {
        console.log(`⚠️ No se pudo eliminar ${file}: ${e.message}`);
      }
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const segments = parseInt(args[0]) || 2; // Por defecto 2 segmentos para prueba
  const mode = args[1] || 'daily';
  
  console.log(`🧪 Test de segmentación: ${segments} segmentos, modo ${mode}\n`);
  
  // Verificar que existe la BD principal
  const dbExists = fs.existsSync('prices.db');
  if (!dbExists) {
    console.log('⚠️ No existe prices.db, se creará una nueva para cada segmento');
  }
  
  try {
    // 1. Ejecutar todos los segmentos en paralelo
    const segmentPromises = [];
    for (let i = 1; i <= segments; i++) {
      segmentPromises.push(runSegment(i, segments, mode));
    }
    
    console.log(`🏃‍♂️ Ejecutando ${segments} segmentos en paralelo...\n`);
    const results = await Promise.allSettled(segmentPromises);
    
    // 2. Verificar resultados
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`\n📊 Resultados: ${successful} exitosos, ${failed} fallidos`);
    
    if (failed > 0) {
      console.log('\n❌ Algunos segmentos fallaron:');
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.log(`   Segmento ${i + 1}: ${r.reason.error || r.reason}`);
        }
      });
    }
    
    // 3. Verificar archivos de BD generados
    console.log('\n📁 Archivos de BD generados:');
    const dbFiles = fs.readdirSync(__dirname).filter(f => f.match(/^prices-\d+\.db$/));
    dbFiles.forEach(file => {
      const sizeMB = (fs.statSync(file).size / (1024*1024)).toFixed(1);
      console.log(`   ${file} (${sizeMB} MB)`);
    });
    
    if (dbFiles.length === 0) {
      console.log('   ⚠️ No se generaron archivos de BD de segmentos');
      return;
    }
    
    // 4. Ejecutar merge
    if (successful > 0) {
      await runMerge();
      
      // 5. Verificar resultado final
      if (fs.existsSync('prices.db')) {
        const finalSizeMB = (fs.statSync('prices.db').size / (1024*1024)).toFixed(1);
        console.log(`\n✅ Test completado! prices.db final: ${finalSizeMB} MB`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error durante el test:', error);
  } finally {
    // cleanup(); // Descomenta si quieres limpiar archivos automáticamente
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runSegment, runMerge };