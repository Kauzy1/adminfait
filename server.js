/**
 * server.js - FAIT v3 com sistema de prêmios fixos por código
 * Backend completo: Express + SQLite + API Admin + Sistema de roleta
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "faitzudosadm100";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ======== BANCO DE DADOS ========
const db = new sqlite3.Database('./database.db');

// Cria tabelas se não existirem
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS codes (
    code TEXT PRIMARY KEY,
    uses_allowed INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    expires_at TEXT,
    assigned_prize_label TEXT,
    assigned_prize_value REAL,
    revoked INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    username TEXT,
    prize_label TEXT,
    prize_value REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
});

// ======== FUNÇÕES ========
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomPrize() {
  // Define os prêmios normais da roleta e suas chances
  const prizes = [
    { label: 'Nada', value: 0, chance: 55 },
    { label: 'R$0,50', value: 0.5, chance: 25 },
    { label: 'R$1,00', value: 1, chance: 10 },
    { label: 'R$5,00', value: 5, chance: 5 },
    { label: 'R$10,00', value: 10, chance: 3 },
    { label: 'R$20,00', value: 20, chance: 2 }
  ];
  const total = prizes.reduce((a, b) => a + b.chance, 0);
  const rand = Math.random() * total;
  let sum = 0;
  for (const p of prizes) {
    sum += p.chance;
    if (rand <= sum) return p;
  }
  return prizes[0];
}

// ======== ENDPOINTS PÚBLICOS ========

// Consumir código (rota principal da roleta)
app.post('/api/play', (req, res) => {
  const { code, username } = req.body;
  if (!code || !username) return res.status(400).json({ error: 'Código e usuário são obrigatórios' });

  db.get('SELECT * FROM codes WHERE code = ?', [code.toUpperCase()], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    if (!row) return res.status(400).json({ error: 'Código inválido' });
    if (row.revoked) return res.status(400).json({ error: 'Código revogado' });

    const now = new Date();
    if (row.expires_at && new Date(row.expires_at) < now)
      return res.status(400).json({ error: 'Código expirado' });

    if (row.uses_count >= row.uses_allowed)
      return res.status(400).json({ error: 'Código já utilizado' });

    // Determinar prêmio
    let prize;
    if (row.assigned_prize_value !== null && row.assigned_prize_value !== undefined) {
      // Código com prêmio fixo
      prize = {
        label: row.assigned_prize_label || `R$${Number(row.assigned_prize_value).toFixed(2)}`,
        value: row.assigned_prize_value
      };
    } else {
      // Código comum (roleta aleatória)
      prize = randomPrize();
    }

    // Atualiza uso e loga resultado
    db.run('UPDATE codes SET uses_count = uses_count + 1 WHERE code = ?', [code.toUpperCase()]);
    db.run('INSERT INTO logs (code, username, prize_label, prize_value) VALUES (?,?,?,?)',
      [code.toUpperCase(), username, prize.label, prize.value]);

    res.json({ success: true, prize });
  });
});

// ======== ROTAS ADMIN ========

// Middleware para verificar senha admin
function requireAdmin(req, res, next) {
  const pass = req.headers['x-admin-password'];
  if (pass !== ADMIN_PASSWORD) return res.status(403).json({ error: 'Senha admin incorreta' });
  next();
}

// Gerar códigos
app.post('/admin/generate', requireAdmin, (req, res) => {
  const { count = 1, uses_allowed = 1, expires_in_days = 30, assigned_prize_label, assigned_prize_value } = req.body;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expires_in_days);

  const stmt = db.prepare('INSERT INTO codes (code, uses_allowed, expires_at, assigned_prize_label, assigned_prize_value) VALUES (?,?,?,?,?)');
  for (let i = 0; i < count; i++) {
    stmt.run(
      generateCode(),
      uses_allowed,
      expires_in_days ? expiresAt.toISOString() : null,
      assigned_prize_label || null,
      assigned_prize_value || null
    );
  }
  stmt.finalize();
  res.json({ success: true, count });
});

// Listar códigos
app.get('/admin/list', requireAdmin, (req, res) => {
  db.all('SELECT * FROM codes ORDER BY rowid DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    res.json({ codes: rows });
  });
});

// Revogar código
app.post('/admin/revoke', requireAdmin, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Código necessário' });
  db.run('UPDATE codes SET revoked = 1 WHERE code = ?', [code.toUpperCase()], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao revogar' });
    res.json({ success: true });
  });
});

// Logs
app.get('/admin/logs', requireAdmin, (req, res) => {
  db.all('SELECT * FROM logs ORDER BY id DESC LIMIT 100', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Erro no banco' });
    res.json({ logs: rows });
  });
});

// ======== FRONTEND ========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ======== INICIAR SERVIDOR ========
app.listen(PORT, () => console.log(`🚀 Servidor FAIT rodando na porta ${PORT}`));