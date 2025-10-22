// app.js - versão otimizada e 100% funcional
const chestsContainer = document.getElementById('chests');
const logEl = document.getElementById('log');
const codeInput = document.getElementById('code-input');
const usernameInput = document.getElementById('username-input');
const useCodeBtn = document.getElementById('use-code');
const gameArea = document.getElementById('game-area');
const locked = document.getElementById('locked');
const winModal = document.getElementById('win-modal');
const bgAudio = document.getElementById('bg-audio');

let currentCode = null;
let currentUsername = null;
let played = false;

// cria 6 baús
for (let i = 0; i < 6; i++) {
  const div = document.createElement('div');
  div.className = 'chest';
  div.dataset.index = i;
  div.innerHTML = `<img src="data:image/svg+xml;utf8,${encodeURIComponent(chestSVG())}" alt="Baú"/><div class="label">Baú ${i + 1}</div>`;
  div.addEventListener('click', onChestClick);
  chestsContainer.appendChild(div);
}

function chestSVG() {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='140' viewBox='0 0 240 140'><rect x='10' y='30' rx='12' ry='12' width='220' height='90' fill='%232f1414'/><rect x='16' y='40' width='208' height='70' fill='%23423838'/><rect x='24' y='56' width='192' height='20' fill='%23ffb84d'/></svg>`;
}

function log(msg) {
  const el = document.createElement('div');
  el.innerText = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(el);
}

useCodeBtn.addEventListener('click', async () => {
  const code = codeInput.value.trim().toUpperCase();
  const username = usernameInput.value.trim();
  if (!code || !username) return alert('Coloque código e nome.');

  try {
    const resp = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || 'Erro ao validar código.');

    currentCode = code;
    currentUsername = username;
    played = false;
    gameArea.style.display = 'block';
    locked.style.display = 'none';
    document.querySelectorAll('.chest').forEach(c => {
      c.classList.remove('disabled');
      c.style.opacity = '1';
      c.style.pointerEvents = 'auto';
    });
    log(`Código ${code} válido. Abra um baú.`);
    bgAudio.play().catch(() => {});
  } catch (err) {
    alert('Erro de conexão com o servidor.');
  }
});

async function onChestClick(e) {
  if (played) return alert('Você já abriu um baú com este código.');
  const chest = e.currentTarget;
  document.querySelectorAll('.chest').forEach(c => {
    c.classList.add('disabled');
    c.style.opacity = '0.6';
    c.style.pointerEvents = 'none';
  });

  try {
    const resp = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: currentCode,
        username: currentUsername,
        chestIndex: chest.dataset.index
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || 'Erro ao jogar.');
      return;
    }
    played = true;
    const prize = data.prize;
    showWin(`Você ganhou ${prize.label}! 🎉`);
    log(`Jogador ${currentUsername} ganhou ${prize.label}.`);
    chest.innerHTML = `<div style="color:#111;background:#ffda6b;padding:8px;border-radius:6px;font-weight:800">${prize.label}</div>`;
    bgAudio.pause();
  } catch {
    alert('Erro ao se comunicar com o servidor.');
  }
}

function showWin(text) {
  winModal.innerText = text;
  winModal.style.display = 'block';
  setTimeout(() => (winModal.style.display = 'none'), 2500);
}

log('Bem-vindo — insira código e nome para começar.');