const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || './database.sqlite';
const db = new Database(dbPath);

// Habilitar foreign keys
db.pragma('foreign_keys = ON');

// Crear tablas
function initializeDatabase() {
    // Tabla de usuarios (simplificada para primera versión)
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Tabla de eventos/proyectos
    db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Tabla de categorías
    db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      keywords TEXT
    )
  `);

    // Tabla de gastos
    db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      category_id INTEGER,
      amount REAL NOT NULL,
      description TEXT,
      merchant TEXT,
      expense_date DATE NOT NULL,
      image_path TEXT,
      ocr_text TEXT,
      has_billing_data BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

    // Tabla de perfiles de facturación del usuario
    db.exec(`
    CREATE TABLE IF NOT EXISTS billing_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rfc TEXT NOT NULL,
      business_name TEXT NOT NULL,
      tax_regime TEXT,
      postal_code TEXT NOT NULL,
      address TEXT,
      email TEXT,
      is_default BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // Tabla de datos de facturación extraídos de tickets
    db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_billing_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER UNIQUE,
      rfc TEXT,
      business_name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      additional_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    )
  `);

    // Insertar categorías predeterminadas
    const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name, icon, color, keywords) VALUES (?, ?, ?, ?)
  `);

    const defaultCategories = [
        ['Alimentación', '🍽️', '#FF6B6B', 'restaurante,comida,alimentos,oxxo,tienda,super'],
        ['Transporte', '🚗', '#4ECDC4', 'gasolina,uber,taxi,peaje,caseta,autobus'],
        ['Hospedaje', '🏨', '#95E1D3', 'hotel,motel,airbnb,hospedaje'],
        ['Servicios', '🔧', '#FFE66D', 'reparacion,servicio,mantenimiento'],
        ['Compras', '🛍️', '#A8E6CF', 'compra,tienda,mercado'],
        ['Entretenimiento', '🎭', '#FFB6C1', 'cine,diversión,museo,parque'],
        ['Salud', '⚕️', '#B4E7CE', 'farmacia,medico,clinica'],
        ['Otros', '📦', '#C7CEEA', 'varios,otros']
    ];

    defaultCategories.forEach(cat => insertCategory.run(...cat));

    console.log('✅ Base de datos inicializada correctamente');
}

// Inicializar al importar
initializeDatabase();

module.exports = db;
