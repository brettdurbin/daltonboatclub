// Node 22+ built-in SQLite — no native compilation needed
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3460;

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage for boat images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `boat-${req.params.id}-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data dir exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Database setup
const db = new DatabaseSync(path.join(dataDir, 'boats.db'));

// Init schema
db.exec(`
  CREATE TABLE IF NOT EXISTS boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    dailyRate REAL NOT NULL,
    capacity INTEGER NOT NULL,
    imageUrl TEXT,
    features TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boatId INTEGER NOT NULL,
    customerName TEXT NOT NULL,
    customerEmail TEXT NOT NULL,
    customerPhone TEXT,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    totalPrice REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (boatId) REFERENCES boats(id)
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    boatId INTEGER NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY (boatId) REFERENCES boats(id)
  );
`);

// Seed boats if empty
const boatCount = db.prepare('SELECT COUNT(*) as count FROM boats').get();
if (boatCount.count === 0) {
  const insert = db.prepare(`
    INSERT INTO boats (name, description, dailyRate, capacity, imageUrl, features)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    'Sea Ray SPX 190',
    '19ft bowrider — sleek, fast, and built for fun. Perfect for watersports, cruising, or a sunset ride with the crew. Wakeboard tower and bimini top keep things dialed.',
    350,
    6,
    '/images/boat1.png',
    JSON.stringify(['Wakeboard tower', 'Bimini top', 'Bluetooth speakers', 'Swim platform'])
  );
  insert.run(
    'Boat 2',
    'Details coming soon.',
    400,
    8,
    '',
    JSON.stringify([])
  );
  console.log('Seed data inserted.');
}

// ─────────────────────────────────────────────
// Admin Auth Middleware
// ─────────────────────────────────────────────
const ADMIN_PASSWORD = 'boatadmin123';

function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-password'] || req.body?.adminPassword;
  if (auth !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

// GET /api/boats
app.get('/api/boats', (req, res) => {
  const boats = db.prepare('SELECT * FROM boats').all();
  boats.forEach(b => {
    b.features = JSON.parse(b.features || '[]');
  });
  res.json(boats);
});

// GET /api/boats/:id
app.get('/api/boats/:id', (req, res) => {
  const boat = db.prepare('SELECT * FROM boats WHERE id = ?').get(req.params.id);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });
  boat.features = JSON.parse(boat.features || '[]');
  res.json(boat);
});

// GET /api/boats/:id/availability?month=YYYY-MM
app.get('/api/boats/:id/availability', (req, res) => {
  const { id } = req.params;
  const { month } = req.query;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
  }

  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(daysInMonth).padStart(2,'0')}`;

  const bookings = db.prepare(`
    SELECT startDate, endDate, status FROM bookings
    WHERE boatId = ? AND status != 'cancelled'
    AND startDate <= ? AND endDate >= ?
  `).all(id, monthEnd, monthStart);

  const blocked = db.prepare(`
    SELECT startDate, endDate FROM blocked_dates
    WHERE boatId = ?
    AND startDate <= ? AND endDate >= ?
  `).all(id, monthEnd, monthStart);

  // Build availability map
  const availability = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${month}-${String(d).padStart(2,'0')}`;
    availability[dateStr] = 'available';
  }

  // Mark bookings
  for (const booking of bookings) {
    let cur = new Date(booking.startDate + 'T00:00:00');
    const end = new Date(booking.endDate + 'T00:00:00');
    while (cur <= end) {
      const ds = cur.toISOString().slice(0, 10);
      if (availability[ds] !== undefined) {
        availability[ds] = booking.status === 'pending' ? 'pending' : 'booked';
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Mark blocked
  for (const block of blocked) {
    let cur = new Date(block.startDate + 'T00:00:00');
    const end = new Date(block.endDate + 'T00:00:00');
    while (cur <= end) {
      const ds = cur.toISOString().slice(0, 10);
      if (availability[ds] !== undefined) {
        availability[ds] = 'blocked';
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  res.json({ boatId: id, month, availability });
});

// POST /api/bookings — public booking creation
app.post('/api/bookings', (req, res) => {
  const {
    boatId, customerName, customerEmail, customerPhone,
    startDate, endDate, notes
  } = req.body;

  if (!boatId || !customerName || !customerEmail || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) {
    return res.status(400).json({ error: 'Invalid dates' });
  }

  // Check for booking conflicts
  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE boatId = ? AND status != 'cancelled'
    AND startDate <= ? AND endDate >= ?
  `).get(boatId, endDate, startDate);
  if (conflict) return res.status(409).json({ error: 'Dates not available' });

  const blockConflict = db.prepare(`
    SELECT id FROM blocked_dates
    WHERE boatId = ? AND startDate <= ? AND endDate >= ?
  `).get(boatId, endDate, startDate);
  if (blockConflict) return res.status(409).json({ error: 'Dates not available (blocked)' });

  // Calculate price
  const boat = db.prepare('SELECT dailyRate FROM boats WHERE id = ?').get(boatId);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });

  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const totalPrice = days * boat.dailyRate;

  const result = db.prepare(`
    INSERT INTO bookings (boatId, customerName, customerEmail, customerPhone, startDate, endDate, totalPrice, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(boatId, customerName, customerEmail, customerPhone || null, startDate, endDate, totalPrice, notes || null);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    boatId, customerName, customerEmail, customerPhone,
    startDate, endDate, totalPrice,
    status: 'pending',
    notes
  });
});

// ─────────────────────────────────────────────
// Admin API
// ─────────────────────────────────────────────

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// GET /api/admin/bookings
app.get('/api/admin/bookings', adminAuth, (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, bo.name as boatName
    FROM bookings b
    JOIN boats bo ON b.boatId = bo.id
    ORDER BY b.createdAt DESC
  `).all();
  res.json(bookings);
});

// POST /api/admin/bookings — manual booking by admin
app.post('/api/admin/bookings', adminAuth, (req, res) => {
  const {
    boatId, customerName, customerEmail, customerPhone,
    startDate, endDate, status, notes
  } = req.body;

  if (!boatId || !customerName || !customerEmail || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const boat = db.prepare('SELECT dailyRate FROM boats WHERE id = ?').get(boatId);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const totalPrice = days * boat.dailyRate;

  const result = db.prepare(`
    INSERT INTO bookings (boatId, customerName, customerEmail, customerPhone, startDate, endDate, totalPrice, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(boatId, customerName, customerEmail, customerPhone || null, startDate, endDate, totalPrice, status || 'confirmed', notes || null);

  res.status(201).json({
    id: Number(result.lastInsertRowid),
    boatId, customerName, customerEmail, startDate, endDate, totalPrice,
    status: status || 'confirmed'
  });
});

// PUT /api/admin/bookings/:id
app.put('/api/admin/bookings/:id', adminAuth, (req, res) => {
  const {
    customerName, customerEmail, customerPhone,
    startDate, endDate, status, notes, boatId
  } = req.body;
  const { id } = req.params;

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const updated = {
    customerName: customerName ?? booking.customerName,
    customerEmail: customerEmail ?? booking.customerEmail,
    customerPhone: customerPhone ?? booking.customerPhone,
    startDate: startDate ?? booking.startDate,
    endDate: endDate ?? booking.endDate,
    status: status ?? booking.status,
    notes: notes ?? booking.notes,
    boatId: boatId ?? booking.boatId,
  };

  const boat = db.prepare('SELECT dailyRate FROM boats WHERE id = ?').get(updated.boatId);
  const start = new Date(updated.startDate + 'T00:00:00');
  const end = new Date(updated.endDate + 'T00:00:00');
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const totalPrice = days * boat.dailyRate;

  db.prepare(`
    UPDATE bookings SET
      customerName = ?, customerEmail = ?, customerPhone = ?,
      startDate = ?, endDate = ?, status = ?, notes = ?, totalPrice = ?, boatId = ?
    WHERE id = ?
  `).run(
    updated.customerName, updated.customerEmail, updated.customerPhone,
    updated.startDate, updated.endDate, updated.status, updated.notes,
    totalPrice, updated.boatId, id
  );

  res.json({ ...updated, id: Number(id), totalPrice });
});

// DELETE /api/admin/bookings/:id
app.delete('/api/admin/bookings/:id', adminAuth, (req, res) => {
  const result = db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// GET /api/admin/blocked-dates
app.get('/api/admin/blocked-dates', adminAuth, (req, res) => {
  const blocked = db.prepare(`
    SELECT bd.*, b.name as boatName
    FROM blocked_dates bd
    JOIN boats b ON bd.boatId = b.id
    ORDER BY bd.startDate
  `).all();
  res.json(blocked);
});

// POST /api/admin/blocked-dates
app.post('/api/admin/blocked-dates', adminAuth, (req, res) => {
  const { boatId, startDate, endDate, reason } = req.body;
  if (!boatId || !startDate || !endDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const result = db.prepare(`
    INSERT INTO blocked_dates (boatId, startDate, endDate, reason)
    VALUES (?, ?, ?, ?)
  `).run(boatId, startDate, endDate, reason || null);
  res.status(201).json({ id: Number(result.lastInsertRowid), boatId, startDate, endDate, reason });
});

// DELETE /api/admin/blocked-dates/:id
app.delete('/api/admin/blocked-dates/:id', adminAuth, (req, res) => {
  const result = db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// PUT /api/admin/boats/:id
app.put('/api/admin/boats/:id', adminAuth, (req, res) => {
  const { name, description, dailyRate, capacity, imageUrl, features } = req.body;
  const boat = db.prepare('SELECT * FROM boats WHERE id = ?').get(req.params.id);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });

  const updated = {
    name: name ?? boat.name,
    description: description ?? boat.description,
    dailyRate: dailyRate ?? boat.dailyRate,
    capacity: capacity ?? boat.capacity,
    imageUrl: imageUrl ?? boat.imageUrl,
    features: features ? JSON.stringify(features) : boat.features,
  };

  db.prepare(`
    UPDATE boats SET name=?, description=?, dailyRate=?, capacity=?, imageUrl=?, features=?
    WHERE id=?
  `).run(updated.name, updated.description, updated.dailyRate, updated.capacity, updated.imageUrl, updated.features, req.params.id);

  updated.features = JSON.parse(updated.features);
  res.json({ id: Number(req.params.id), ...updated });
});

// ── Image Upload ──────────────────────────────
app.post('/api/admin/boats/:id/image', adminAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const boat = db.prepare('SELECT * FROM boats WHERE id = ?').get(req.params.id);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });

  // Delete old uploaded image if it was a local upload
  if (boat.imageUrl && boat.imageUrl.startsWith('/uploads/')) {
    const oldPath = path.join(__dirname, 'public', boat.imageUrl);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE boats SET imageUrl = ? WHERE id = ?').run(imageUrl, req.params.id);

  res.json({ imageUrl });
});

// Serve admin page at /admin too
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log(`Boat rental server running at http://localhost:${PORT}`);
});
