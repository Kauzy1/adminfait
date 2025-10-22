
/**
 * server.js - Final complete backend
 * - Node (CommonJS) + sqlite3
 * - Single-use codes by default; admin can set uses_allowed if desired but UI will use single-use typically.
 * - /api/play consumes a code, requires username, returns prize and records log with username.
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

const DB = path.join(__dirname, 'data.sqlite');
const db = new sqlite3.Database(DB, (err) => {
  if(err){ console.error('DB open error', err); process.exit(1); }
  console.log('DB opened at', DB);
});

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
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

function requireAdmin(req,res,next){
  if(req.header('x-admin-password') !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Admin: generate codes (default uses_allowed=1)
app.post('/admin/generate', requireAdmin, (req,res)=>{
  const { count=1, uses_allowed=1, expires_in_days=30 } = req.body || {};
  const created_at = Date.now();
  const expires_at = expires_in_days>0 ? created_at + expires_in_days*24*60*60*1000 : null;
  const inserted = [];
  let i=0;
  function insertOne(){
    if(i>=count) return res.json({ inserted, count: inserted.length });
    const code = (uuidv4().split('-')[0]).toUpperCase();
    db.run('INSERT INTO codes(code,uses_allowed,uses_count,created_at,expires_at) VALUES(?,?,?,?,?)',
      [code, uses_allowed, 0, created_at, expires_at],
      (err)=>{
        if(!err) inserted.push(code);
        i++; insertOne();
      });
  }
  insertOne();
});

// Admin: list codes
app.get('/admin/list', requireAdmin, (req,res)=>{
  db.all('SELECT id,code,uses_allowed,uses_count,created_at,expires_at FROM codes ORDER BY id DESC LIMIT 1000', [], (err,rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json({ codes: rows });
  });
});

// Admin: revoke code
app.post('/admin/revoke', requireAdmin, (req,res)=>{
  const { code } = req.body || {};
  if(!code) return res.status(400).json({ error: 'code required' });
  db.run('DELETE FROM codes WHERE code = ?', [code], function(err){
    if(err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, deleted: this.changes });
  });
});

// Admin: logs
app.get('/admin/logs', requireAdmin, (req,res)=>{
  db.all('SELECT id,code,username,prize_label,prize_value,created_at FROM prize_log ORDER BY id DESC LIMIT 1000', [], (err,rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json({ logs: rows });
  });
});

// API: validate code without consuming (front-end can call to check availability)
app.post('/api/redeem', (req,res)=>{
  const { code } = req.body || {};
  if(!code) return res.status(400).json({ error: 'code required' });
  db.get('SELECT * FROM codes WHERE code = ?', [code], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    if(!row) return res.status(404).json({ error: 'Código inválido' });
    const now = Date.now();
    if(row.expires_at && now > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if(row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código sem usos restantes' });
    const remaining = Math.max(0, row.uses_allowed - row.uses_count);
    res.json({ ok: true, code: row.code, remaining });
  });
});

// API: play - consumes one use, requires username, returns prize. Single chest per code.
// Implements weighted probabilities as requested.
app.post('/api/play', (req,res)=>{
  const { code, username, chestIndex } = req.body || {};
  if(!code) return res.status(400).json({ error: 'code required' });
  if(!username) return res.status(400).json({ error: 'username required' });
  db.get('SELECT * FROM codes WHERE code = ?', [code], (err,row)=>{
    if(err) return res.status(500).json({ error: err.message });
    if(!row) return res.status(404).json({ error: 'Código inválido' });
    const now = Date.now();
    if(row.expires_at && now > row.expires_at) return res.status(400).json({ error: 'Código expirado' });
    if(row.uses_count >= row.uses_allowed) return res.status(400).json({ error: 'Código sem usos restantes' });

    // Prize definitions with weights mapped to requested percentages
    // We'll convert the %-like weights to integers to use as weights.
    const prizes = [
      { label: 'R$0,50', value: 0.5, weight: 80 },
      { label: 'R$1,00', value: 1.0, weight: 50 },
      { label: 'R$2,00', value: 2.0, weight: 30 },
      { label: 'R$3,00', value: 3.0, weight: 20 },
      { label: 'R$4,00', value: 4.0, weight: 20 },
      { label: 'R$5,00', value: 5.0, weight: 10 },
      { label: 'R$10,00', value: 10.0, weight: 5 }
    ];

    const total = prizes.reduce((s,p)=>s+p.weight,0);
    let r = Math.random() * total;
    let chosen = prizes[prizes.length-1];
    for(let i=0;i<prizes.length;i++){
      r -= prizes[i].weight;
      if(r <= 0){ chosen = prizes[i]; break; }
    }

    // consume one use
    db.run('UPDATE codes SET uses_count = uses_count + 1 WHERE id = ?', [row.id], function(err2){
      if(err2) return res.status(500).json({ error: err2.message });
      // record log with username and prize
      db.run('INSERT INTO prize_log(code,username,prize_label,prize_value,created_at) VALUES(?,?,?,?,?)',
        [row.code, username, chosen.label, chosen.value, Date.now()], function(err3){
          if(err3) console.error('log insert error', err3);
          res.json({ prize: chosen, message: 'Prêmio revelado', chestIndex: chestIndex });
        });
    });
  });
});

app.listen(PORT, ()=>console.log('Treasure server (final) running on port', PORT));
