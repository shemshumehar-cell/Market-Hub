const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');

const dbPath =
  process.env.DB_PATH ||
  path.join(__dirname, '..', 'database', 'markethub.db');

const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

function initDatabase() {
  // Users
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'vendor', 'admin')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'suspended')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );
  `);

  // Products
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      category_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL CHECK(price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'inactive', 'delisted')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  // Orders
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      total_amount REAL NOT NULL CHECK(total_amount >= 0),
      status TEXT NOT NULL DEFAULT 'paid'
        CHECK(status IN (
          'pending',
          'paid',
          'shipped',
          'delivered',
          'cancelled'
        )),
      shipping_address TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Order Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (vendor_id) REFERENCES users(id)
    );
  `);

  // Cart
  db.exec(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // Audit Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const catCount = db
    .prepare('SELECT COUNT(*) as count FROM categories')
    .get();

  if (catCount.count === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (name, slug) VALUES (?, ?)'
    );

    insertCat.run('Electronics', 'electronics');
    insertCat.run('Security Tools', 'security-tools');
    insertCat.run('Books & Guides', 'books-guides');
    insertCat.run('Hardware', 'hardware');
  }

  const userCount = db
    .prepare('SELECT COUNT(*) as count FROM users')
    .get();

  if (userCount.count === 0) {
    const defaultPassword = 'Password123!';
    const salt = bcrypt.genSaltSync(12);
    const passwordHash = bcrypt.hashSync(defaultPassword, salt);

    const insertUser = db.prepare(`
      INSERT INTO users
        (name, email, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Admin
    insertUser.run(
      'Platform Administrator',
      'admin@markethub.local',
      passwordHash,
      'admin',
      'active'
    );

    // Vendor 1
    const vendorResult = insertUser.run(
      'SecureTech Systems (Vendor)',
      'vendor@markethub.local',
      passwordHash,
      'vendor',
      'active'
    );

    const vendorId = Number(vendorResult.lastInsertRowid);

    // Vendor 2
    const vendor2Result = insertUser.run(
      'CyberShield Labs (Vendor 2)',
      'vendor2@markethub.local',
      passwordHash,
      'vendor',
      'active'
    );

    const vendor2Id = Number(vendor2Result.lastInsertRowid);

    // Customer
    insertUser.run(
      'Alice Johnson (Customer)',
      'customer@markethub.local',
      passwordHash,
      'customer',
      'active'
    );

    const insertProduct = db.prepare(`
      INSERT INTO products
        (
          vendor_id,
          category_id,
          title,
          description,
          price,
          stock,
          image_url,
          status
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    insertProduct.run(
      vendorId,
      2,
      'Hardware 2FA Security Key',
      'FIDO2 and U2F certified USB-C / NFC hardware authentication token with tamper-resistant cryptographic co-processor.',
      49.99,
      50,
      '/images/security-key.svg'
    );

    insertProduct.run(
      vendorId,
      1,
      'Encrypted External NVMe Drive 1TB',
      'Hardware-level AES-XTS 256-bit encryption with OLED PIN keypad and military-grade physical enclosure.',
      149.99,
      25,
      '/images/ssd.svg'
    );

    insertProduct.run(
      vendorId,
      3,
      'Defensive Web Engineering Handbook',
      'Comprehensive 2026 edition covering OWASP Top 10, zero-trust architectures, and secure API design.',
      34.5,
      100,
      '/images/book.svg'
    );

    insertProduct.run(
      vendor2Id,
      4,
      'Hardware Network Tap Monitor',
      'Passive Gigabit Ethernet TAP providing 100% full-duplex traffic monitoring without introducing network latency or packet loss.',
      89.0,
      15,
      '/images/tap.svg'
    );
  }
}

function logAudit(userId, action, details, ipAddress) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs
        (user_id, action, details, ip_address)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      userId || null,
      action,
      details || '',
      ipAddress || '127.0.0.1'
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = {
  db,
  initDatabase,
  logAudit
};
