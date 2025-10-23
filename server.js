/**
 * server.js - FAIT v4
 * - Adiciona suporte a valor fixo personalizado por código
 * - 100% compatível com Railway e painel admin
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

// === Banco ===
const DB = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB);

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

// === Funções auxiliares ===
function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Senha incorreta' });
  next();
}

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

  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  const r = Math.random() * total;
  let acc = 0;
  for (const p of prizes) {
    acc += p.weight;
    if (r <= acc) return p;
  }
  return prizes[0];
}

// === Rotas ADMIN ===

// Gerar código com valor fixo customizado
app.post('/admin/generate', requireAdmin, (req, res) => {
  const {
    count = 1,
    uses_allowed = 1,
    expires_in_days = 30,
    fixed_value = null
  } = req.body || {};

  const created_at = Date.now();
  const expires_at = expires_in_days > 0
    ? created_at + expires_in_days * 24 * 60 * 60 * 1000
    : null;

  const inserted = [];

  function gerarUm(i) {
    if (i >= count) return res.json({ count: inserted.length, codes: inserted });

    const code = uuidv4().split('-')[0].toUpperCase();
    const valor = parseFloat(fixed_value);

    const hasFixed = !isNaN(valor) && valor > 0;
    const label = hasFixed ? `R$${valor.toFixed(2)}` : null;
    const val = hasFixed ? valor : null;

    db.run(
      `INSERT INTO codes (code, uses_allowed, uses_count, fixed_prize_label, fixed_prize_value, created_at, expires_at)
       VALUES (?, ?, 0, ?, ?, ?, ?)`,
      [code, uses_allowed, label, val, created_at, expires_at],
      (err) => {
        if (!err) inserted.push(code);
        gerarUm(i + 1);
      }
    );
  }

  gerarUm(0);
});

// Listar códigos
app.get('/admin/list', requireAdmin, (req, res) => {
  db.all('SELECT * FROM codes ORDER BY id DESC LIMIT 500', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ codes: rows });
  });
});

// Logs
app.get('/admin/logs', requireAdmin, (req, res) => {
  db.all('SELECT * FROM prize_log ORDER BY id DESC LIMIT 500', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ logs: rows });
  });
});

// === Rotas públicas ===

// Validar código
app.post('/api/redeem', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });
    if (row.uses_count >= row.uses_allowed)
      return res.status(400).json({ error: 'Código já usado' });

    res.json({ ok: true });
  });
});

// Jogar
app.post('/api/play', (req, res) => {
  const { code, username } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });
  if (!username) return res.status(400).json({ error: 'Nome obrigatório' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });
    if (row.uses_count >= row.uses_allowed)
      return res.status(400).json({ error: 'Código já usado' });

    const prize = row.fixed_prize_value
      ? { label: row.fixed_prize_label, value: row.fixed_prize_value }
      : getWeightedPrize();

    db.run(
      'UPDATE codes SET uses_count = uses_count + 1 WHERE id = ?',
      [row.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.run(
          'INSERT INTO prize_log (code, username, prize_label, prize_value, created_at) VALUES (?, ?, ?, ?, ?)',
          [row.code, username, prize.label, prize.value, Date.now()],
          () => res.json({ prize, message: 'Prêmio liberado!' })
        );
      }
    );
  });
});

// Painel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === Iniciar servidor ===
app.listen(PORT, () => console.log(`🚀 FAIT v4 rodando na porta ${PORT}`));
