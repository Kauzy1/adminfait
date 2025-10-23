/**
 * server.js - FAIT Caça ao Tesouro 🎃 (Versão Final Corrigida)
 * - Backend Node + SQLite3
 * - Sistema de códigos com valor fixo
 * - Totalmente compatível com Railway
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
const DB_FILE = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco de dados', err);
    process.exit(1);
  }
  console.log('✅ Banco de dados conectado:', DB_FILE);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    prize_label TEXT,
    prize_value REAL,
    uses_allowed INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
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

// === Middleware Admin === //
function requireAdmin(req, res, next) {
  if (req.header('x-admin-password') !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Senha incorreta ou não autorizada' });
  next();
}

// === Rotas Admin === //

// Gerar códigos com valor fixo
app.post('/admin/generate', requireAdmin, async (req, res) => {
  const { count = 1, prize_label, prize_value, uses_allowed = 1, expires_in_days = 30 } = req.body || {};
  if (!prize_label || !prize_value) return res.status(400).json({ error: 'Informe o valor e o nome do prêmio' });

  const created_at = Date.now();
  const expires_at = expires_in_days > 0 ? created_at + expires_in_days * 24*60*60*1000 : null;
  const inserted = [];

  for (let i = 0; i < count; i++) {
    const code = (uuidv4().split('-')[0]).toUpperCase();
    try {
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO codes(code,prize_label,prize_value,uses_allowed,uses_count,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
          [code, prize_label, prize_value, uses_allowed, 0, created_at, expires_at],
          (err) => err ? reject(err) : resolve()
        );
      });
      inserted.push(code);
    } catch (e) {
      console.error('Erro ao inserir código', e);
    }
  }

  res.json({ ok: true, count: inserted.length, inserted });
});

// Listar códigos
app.get('/admin/list', requireAdmin, (req, res) => {
  db.all(
    'SELECT id,code,prize_label,prize_value,uses_count,uses_allowed,expires_at FROM codes ORDER BY id DESC LIMIT 500',
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
  db.all('SELECT * FROM prize_log ORDER BY id DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ logs: rows });
  });
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
    if (row.expires_at && now > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código já utilizado' });

    res.json({ ok: true, code: row.code, prize_label: row.prize_label, prize_value: row.prize_value });
  });
});

// Jogar — entrega o prêmio fixo
app.post('/api/play', (req, res) => {
  const { code, username } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Código obrigatório' });
  if (!username) return res.status(400).json({ error: 'Nome de usuário obrigatório' });

  db.get('SELECT * FROM codes WHERE code = ?', [code], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Código inválido' });
    const now = Date.now();
    if (row.expires_at && now > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if (row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código já utilizado' });

    // Consome o código
    db.run('UPDATE codes SET uses_count = uses_count + 1 WHERE id = ?', [row.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });

      // Registra o log
      db.run(
        'INSERT INTO prize_log(code,username,prize_label,prize_value,created_at) VALUES(?,?,?,?,?)',
        [row.code, username, row.prize_label, row.prize_value, Date.now()],
        (err3) => {
          if (err3) console.error('Erro ao salvar log', err3);
          res.json({
            ok: true,
            prize: { label: row.prize_label, value: row.prize_value },
            message: '🎁 Prêmio entregue!',
          });
        }
      );
    });
  });
});

// Painel admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// === Inicialização === //
app.listen(PORT, () => console.log(`🚀 Servidor FAIT rodando na porta ${PORT}`));
