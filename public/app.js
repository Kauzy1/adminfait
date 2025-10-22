
// app.js - chests gameplay. Six chests, single reveal per code, sends username to backend.
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

// create 6 chests
for(let i=0;i<6;i++){
  const div = document.createElement('div');
  div.className = 'chest';
  div.dataset.index = i;
  div.innerHTML = `<img src="data:image/svg+xml;utf8,${encodeURIComponent(chestSVG())}" alt="Baú"/><div class="label">Baú ${i+1}</div>`;
  div.addEventListener('click', onChestClick);
  chestsContainer.appendChild(div);
}

function chestSVG(){
  return `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='140' viewBox='0 0 240 140'><rect x='10' y='30' rx='12' ry='12' width='220' height='90' fill='%232f1414'/><rect x='16' y='40' width='208' height='70' fill='%23423838'/><rect x='24' y='56' width='192' height='20' fill='%23ffb84d'/></svg>`;
}

function log(msg){
  const el = document.createElement('div');
  el.innerText = `${new Date().toLocaleTimeString()} — ${msg}`;
  logEl.prepend(el);
}

useCodeBtn.addEventListener('click', async ()=>{
  const code = codeInput.value.trim().toUpperCase();
  const username = usernameInput.value.trim();
  if(!code || !username){ alert('Coloque código e seu nome.'); return; }
  try{
    const resp = await fetch('/api/redeem', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code }) });
    const data = await resp.json();
    if(!resp.ok){ alert(data.error || 'Erro'); return; }
    currentCode = code;
    currentUsername = username;
    played = false;
    gameArea.style.display = 'block';
    locked.style.display = 'none';
    // enable chests
    document.querySelectorAll('.chest').forEach(c=>{ c.classList.remove('disabled'); c.style.opacity = '1'; c.style.pointerEvents = 'auto'; });
    log(`Código ${code} válido. Abra apenas 1 baú.`);
  }catch(e){ alert('Erro ao validar código'); }
});

async function onChestClick(e){
  if(played){ alert('Você já abriu um baú com este código.'); return; }
  const chest = e.currentTarget;
  // disable all chests immediately
  document.querySelectorAll('.chest').forEach(c=>{ c.classList.add('disabled'); c.style.pointerEvents = 'none'; c.style.opacity = '0.6'; });
  // call backend to play
  try{
    const resp = await fetch('/api/play', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ code: currentCode, username: currentUsername, chestIndex: chest.dataset.index }) });
    const data = await resp.json();
    if(!resp.ok){ alert(data.error || 'Erro'); 
      // re-enable if error and code still valid
      document.querySelectorAll('.chest').forEach(c=>{ c.classList.remove('disabled'); c.style.pointerEvents = 'auto'; c.style.opacity = '1'; });
      return;
    }
    played = true;
    const prize = data.prize;
    showWin(`Você ganhou ${prize.label}`);
    log(`Jogador ${currentUsername} abriu baú e ganhou ${prize.label}`);
    // mark the clicked chest visually as opened
    chest.innerHTML = `<div style="color:#111;background:#ffda6b;padding:8px;border-radius:6px;font-weight:800">${prize.label}</div>`;
    // stop audio after reveal
  }catch(err){ alert('Erro ao revelar prêmio'); }
}

function showWin(text){
  winModal.innerText = text;
  winModal.style.display = 'block';
  setTimeout(()=>{ winModal.style.display = 'none'; }, 2500);
}

bgAudio.pause();
log('Bem-vindo — insira código e nome para começar.');
