const Database = require('better-sqlite3');
const path = require('path');

function addColumnIfMissing(db, table, column, definition) {
    const cols = db.pragma(`table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

function initializeDatabase(db) {
    db.pragma('foreign_keys = ON');

    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    // events evoluciona a rutas de viaje (misma tabla, campos extra)
    db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'abierta',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    addColumnIfMissing(db, 'events', 'origin', 'TEXT');
    addColumnIfMissing(db, 'events', 'destination', 'TEXT');
    addColumnIfMissing(db, 'events', 'slug', 'TEXT');
    addColumnIfMissing(db, 'events', 'notes', 'TEXT');

    db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      keywords TEXT
    )
  `);

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

    addColumnIfMissing(db, 'expenses', 'ticket_code', 'TEXT');
    addColumnIfMissing(db, 'expenses', 'metadata_path', 'TEXT');
    addColumnIfMissing(db, 'expenses', 'uso_cfdi', 'TEXT');
    addColumnIfMissing(db, 'expenses', 'forma_pago', 'TEXT');
    addColumnIfMissing(db, 'expenses', 'iva', 'REAL');
    addColumnIfMissing(db, 'expenses', 'deducible', 'INTEGER DEFAULT 0');
    addColumnIfMissing(db, 'expenses', 'confianza_categoria', 'REAL');

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

    db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER,
      playbook_id TEXT,
      metodo TEXT,
      portal_url TEXT,
      folio TEXT,
      estado TEXT DEFAULT 'pendiente',
      cfdi_uuid TEXT,
      dictamen_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS cfdi_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER,
      invoice_job_id INTEGER,
      uuid TEXT,
      rfc_emisor TEXT,
      rfc_receptor TEXT,
      total REAL,
      fecha TEXT,
      xml_path TEXT,
      pdf_path TEXT,
      metadata_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
      FOREIGN KEY (invoice_job_id) REFERENCES invoice_jobs(id) ON DELETE SET NULL
    )
  `);

    const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name, icon, color, keywords) VALUES (?, ?, ?, ?)
  `);

    const defaultCategories = [
        ['Alimentación', '🍽️', '#FF6B6B', 'restaurante,comida,alimentos,oxxo,tienda,super'],
        ['Transporte', '🚗', '#4ECDC4', 'gasolina,pemex,uber,taxi,peaje,caseta,autobus'],
        ['Hospedaje', '🏨', '#95E1D3', 'hotel,motel,airbnb,hospedaje'],
        ['Servicios', '🔧', '#FFE66D', 'reparacion,servicio,mantenimiento'],
        ['Compras', '🛍️', '#A8E6CF', 'compra,tienda,mercado'],
        ['Entretenimiento', '🎭', '#FFB6C1', 'cine,diversión,museo,parque'],
        ['Salud', '⚕️', '#B4E7CE', 'farmacia,guadalajara,medico,clinica'],
        ['Otros', '📦', '#C7CEEA', 'varios,otros']
    ];

    defaultCategories.forEach((cat) => insertCategory.run(...cat));
}

let db;

function getDb() {
    if (!db) {
        const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');
        db = new Database(dbPath);
        initializeDatabase(db);
    }
    return db;
}

function resetDbForTests() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = new Proxy(
    { getDb, resetDbForTests, initializeDatabase },
    {
        get(target, prop) {
            if (prop in target) {
                return target[prop];
            }
            const instance = getDb();
            const value = instance[prop];
            return typeof value === 'function' ? value.bind(instance) : value;
        }
    }
);
