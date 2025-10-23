/**
 * server.js - Fix definitivo: entrega prize fixo por código se definido
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'faitzudosadm100';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB
const DB = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB, (err) => {
  if (err) {
    console.error('Erro ao abrir DB', err);
    process.exit(1);
  }
  console.log('DB aberto em', DB);
});

// ensure tables + columns exist (safe create; ALTER handled separately if needed)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    uses_allowed INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    fixed_prize_label TEXT,
    fixed_prize_value REAL,
    created_at INTEGER,
    expires_at INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS prize_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    username TEXT,
    prize_label TEXT,
    prize_value REAL,
    created_at INTEGER
  )`);
});

// util: require admin header
function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// weighted prize (fallback, unchanged)
function getWeightedPrize() {
  const prizes = [
    { label: 'R$0,50', value: 0.5, weight: 80 },
    { label: 'R$1,00', value: 1.0, weight: 50 },
    { label: 'R$2,00', value: 2.0, weight: 30 },
    { label: 'R$3,00', value: 3.0, weight: 20 },
    { label: 'R$4,00', value: 4.0, weight: 20 },
    { label: 'R$5,00', value: 5.0, weight: 10 },
    { label: 'R$10,00', value: 10.0, weight: 5 },
  ];
  const total = prizes.reduce((s,p)=>s+p.weight,0);
  let r = Math.random() * total;
  for (const p of prizes) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return prizes[0];
}

// ----------------- ADMIN ROUTES -----------------

// generate codes (accepts multiple parameter names for compatibility)
app.post('/admin/generate', requireAdmin, (req, res) => {
  const body = req.body || {};
  const count = parseInt(body.count) || 1;
  const uses_allowed = parseInt(body.uses_allowed) || parseInt(body.uses) || 1;
  const expires_in_days = body.expires_in_days !== undefined ? parseInt(body.expires_in_days) : (body.days ? parseInt(body.days) : 30);

  // Accept either "fixed_value" OR "fixed_prize_value" OR "assigned_prize_value" OR "fixedValue"
  let fixed_value = null;
  if (body.fixed_value !== undefined) fixed_value = body.fixed_value;
  else if (body.fixed_prize_value !== undefined) fixed_value = body.fixed_prize_value;
  else if (body.assigned_prize_value !== undefined) fixed_value = body.assigned_prize_value;
  else if (body.fixedValue !== undefined) fixed_value = body.fixedValue;

  // Accept label too (optional)
  let fixed_label = null;
  if (body.fixed_prize_label !== undefined) fixed_label = body.fixed_prize_label;
  else if (body.assigned_prize_label !== undefined) fixed_label = body.assigned_prize_label;
  else if (body.fixed_label !== undefined) fixed_label = body.fixed_label;
  else if (body.prize_label !== undefined) fixed_label = body.prize_label;

  const created_at = Date.now();
  const expires_at = expires_in_days > 0 ? created_at + expires_in_days*24*60*60*1000 : null;

  const inserted = [];
  let i = 0;
  function nextOne() {
    if (i >= count) return res.json({ count: inserted.length, codes: inserted });
    const code = (uuidv4().split('-')[0]).toUpperCase();
    // parse numeric fixed value safely
    const fixedValueNum = fixed_value !== null && fixed_value !== '' ? Number(fixed_value) : null;
    const finalLabel = fixed_label || (fixedValueNum !== null && !isNaN(fixedValueNum) ? `R$${fixedValueNum.toFixed(2)}` : null);
    const finalValue = (fixedValueNum !== null && !isNaN(fixedValueNum)) ? fixedValueNum : null;

    db.run(
      `INSERT INTO codes (code, uses_allowed, uses_count, fixed_prize_label, fixed_prize_value, created_at, expires_at)
       VALUES (?, ?, 0, ?, ?, ?, ?)`,
      [code, uses_allowed, finalLabel, finalValue, created_at, expires_at],
      (err) => {
        if (!err) inserted.push(code);
        i++; nextOne();
      }
    );
  }
  nextOne();
});

// list codes (shows fixed prize info)
app.get('/admin/list', requireAdmin, (req, res) => {
  db.all('SELECT id, code, uses_allowed, uses_count, fixed_prize_label, fixed_prize_value, created_at, expires_at FROM codes ORDER BY id DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ codes: rows });
  });
});

// revoke
app.post('/admin/revoke', requireAdmin, (req, res) => {
  const code = (req.body && req.body.code) ? req.body.code : null;
  if (!code) return res.status(400).json({ error: 'code required' });
  db.run('DELETE FROM codes WHERE code = ?', [code], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, deleted: this.changes });
  });
});

// logs
app.get('/admin/logs', requireAdmin, (req, res) => {
  db.all('SELECT id, code, username, prize_label, prize_value, created_at FROM prize_log ORDER BY id DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ logs: rows });
  });
});

// ----------------- PUBLIC ROUTES -----------------

// redeem (validate without consuming) - returns fixed prize info as well
app.post('/api/redeem', (req, res) => {
  const code = (req.body && req.body.code) ? req.body.code : null;
  if (!code) return res.status(400).json({ error: 'code required' });
  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });
    const now = Date.now();
    if (row.expires_at && now > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código sem usos restantes' });
    res.json({
      ok: true,
      code: row.code,
      fixed_prize_label: row.fixed_prize_label,
      fixed_prize_value: row.fixed_prize_value,
      remaining: Math.max(0, row.uses_allowed - row.uses_count)
    });
  });
});

// play: consume use and return prize (if fixed prize exists -> use it; else weighted)
app.post('/api/play', (req, res) => {
  const code = (req.body && req.body.code) ? req.body.code : null;
  const username = (req.body && req.body.username) ? req.body.username : null;
  if (!code) return res.status(400).json({ error: 'code required' });
  if (!username) return res.status(400).json({ error: 'username required' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });
    if (row.expires_at && Date.now() > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código sem usos restantes' });

    // Determine prize: if fixed_prize_value is NOT NULL => deliver fixed prize
    let chosen;
    if (row.fixed_prize_value !== null && row.fixed_prize_value !== undefined) {
      chosen = {
        label: row.fixed_prize_label || (`R$${Number(row.fixed_prize_value).toFixed(2)}`),
        value: Number(row.fixed_prize_value)
      };
    } else {
      chosen = getWeightedPrize();
    }

    // consume
    db.run('UPDATE codes SET uses_count = uses_count + 1 WHERE id = ?', [row.id], function(err2){
      if (err2) return res.status(500).json({ error: err2.message });
      // log
      db.run('INSERT INTO prize_log(code, username, prize_label, prize_value, created_at) VALUES (?, ?, ?, ?, ?)',
        [row.code, username, chosen.label, chosen.value, Date.now()],
        (err3) => {
          if (err3) console.error('log error', err3);
          res.json({ prize: chosen });
        });
    });
  });
});

// admin page route (serve file)
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// fallback / root
app.get('*', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

// start
app.listen(PORT, ()=> console.log('Server running on', PORT));
