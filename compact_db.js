// Script para compactar la base de datos sin borrar datos
// VACUUM recupera espacio desperdiciado sin eliminar historial

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'prices.db');

function compactDatabase() {
  const db = new Database(DB_PATH);
  
  // Tamaño antes
  const sizeBefore = fs.statSync(DB_PATH).size / (1024 * 1024);
  console.log(`Tamaño actual: ${sizeBefore.toFixed(2)} MB`);
  
  // VACUUM para compactar la base de datos y recuperar espacio
  console.log('Compactando base de datos (esto puede tomar varios minutos)...');
  db.exec('VACUUM');
  
  db.close();
  
  // Tamaño después
  const sizeAfter = fs.statSync(DB_PATH).size / (1024 * 1024);
  const saved = sizeBefore - sizeAfter;
  const percentage = (saved / sizeBefore * 100).toFixed(1);
  
  console.log('✓ Base de datos compactada');
  console.log(`Tamaño final: ${sizeAfter.toFixed(2)} MB`);
  console.log(`Espacio recuperado: ${saved.toFixed(2)} MB (${percentage}%)`);
  
  // Estadísticas
  const db2 = new Database(DB_PATH);
  const products = db2.prepare('SELECT COUNT(*) as count FROM products').get();
  const variants = db2.prepare('SELECT COUNT(*) as count FROM variants').get();
  const prices = db2.prepare('SELECT COUNT(*) as count FROM prices').get();
  
  console.log('\n=== Estadísticas ===');
  console.log(`Productos: ${products.count}`);
  console.log(`Variantes: ${variants.count}`);
  console.log(`Precios (historial completo): ${prices.count}`);
  
  db2.close();
}

compactDatabase();
