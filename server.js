/**
 * server.js - FAIT v3 (Halloween Edition 🎃)
 * - Node.js + Express + SQLite3
 * - Sistema de códigos com prêmios fixos ou sorteio normal
 * - Painel admin protegido com x-admin-password
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

// === Banco de Dados === //
const DB = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados', err);
    process.exit(1);
  }
  console.log('🎃 Banco de dados conectado:', DB);
});

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

// === Funções === //
function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Senha incorreta ou não autorizada' });
  next();
}

// Sorteio aleatório (ponderado)
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

  const totalWeight = prizes.reduce((s, p) => s + p.weight, 0);
  const r = Math.random() * totalWeight;
  let c = 0;
  for (const p of prizes) {
    c += p.weight;
    if (r <= c) return p;
  }
  return prizes[0];
}

// === Rotas Admin === //

// Gerar códigos com prêmio fixo opcional
app.post('/admin/generate', requireAdmin, (req, res) => {
  const {
    count = 1,
    uses_allowed = 1,
    expires_in_days = 30,
    fixed_prize_label = null,
    fixed_prize_value = null,
  } = req.body || {};

  const created_at = Date.now();
  const expires_at = expires_in_days > 0
    ? created_at + expires_in_days * 24 * 60 * 60 * 1000
    : null;

  const inserted = [];
  let i = 0;

  function insertOne() {
    if (i >= count) return res.json({ inserted, count: inserted.length });
    const code = uuidv4().split('-')[0].toUpperCase();
    db.run(
      `INSERT INTO codes (code, uses_allowed, uses_count, fixed_prize_label, fixed_prize_value, created_at, expires_at)
       VALUES (?, ?, 0, ?, ?, ?, ?)`,
      [code, uses_allowed, fixed_prize_label, fixed_prize_value, created_at, expires_at],
      (err) => {
        if (!err) inserted.push(code);
        i++;
        insertOne();
      }
    );
  }

  insertOne();
});

// Listar códigos
app.get('/admin/list', requireAdmin, (req, res) => {
  db.all(
    'SELECT * FROM codes ORDER BY id DESC LIMIT 1000',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ codes: rows });
    }
  );
});

// Revogar código
app.post('/admin/revoke', requireAdmin, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });
  db.run('DELETE FROM codes WHERE code = ?', [code], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, deleted: this.changes });
  });
});

// Logs
app.get('/admin/logs', requireAdmin, (req, res) => {
  db.all(
    'SELECT * FROM prize_log ORDER BY id DESC LIMIT 1000',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ logs: rows });
    }
  );
});

// === Rotas Públicas === //

// Validar código
app.post('/api/redeem', (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });

    const now = Date.now();
    if (row.expires_at && now > row.expires_at)
      return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed)
      return res.status(400).json({ error: 'Código já utilizado' });

    res.json({ ok: true });
  });
});

// Jogar / consumir código
app.post('/api/play', (req, res) => {
  const { code, username } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });
  if (!username) return res.status(400).json({ error: 'Nome obrigatório' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });

    const now = Date.now();
    if (row.expires_at && now > row.expires_at)
      return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed)
      return res.status(400).json({ error: 'Código já utilizado' });

    // Verifica se tem prêmio fixo
    const chosen = row.fixed_prize_label
      ? { label: row.fixed_prize_label, value: row.fixed_prize_value }
      : getWeightedPrize();

    // Atualiza uso
    db.run(
      'UPDATE codes SET uses_count = uses_count + 1 WHERE id = ?',
      [row.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        // Loga o prêmio
        db.run(
          'INSERT INTO prize_log (code, username, prize_label, prize_value, created_at) VALUES (?, ?, ?, ?, ?)',
          [row.code, username, chosen.label, chosen.value, now],
          (err3) => {
            if (err3) console.error('Erro ao salvar log', err3);
            res.json({ prize: chosen, message: 'Prêmio revelado!' });
          }
        );
      }
    );
  });
});

// Painel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === Servidor === //
app.listen(PORT, () => console.log(`🚀 Servidor FAIT rodando na porta ${PORT}`));
