// app.js - Responsivo, visual e funcional
// Compatível com backend: POST /api/redeem {code} and POST /api/play {code, username, chestIndex}
// Assumptions: server returns { ok, remaining } for /api/redeem and { prize } for /api/play

(() => {
  const chestsContainer = document.getElementById('chests');
  const logEl = document.getElementById('log');
  const codeInput = document.getElementById('code-input');
  const usernameInput = document.getElementById('username-input');
  const useCodeBtn = document.getElementById('use-code');
  const gameArea = document.getElementById('game-area');
  const locked = document.getElementById('locked');
  const winEl = document.getElementById('win');
  const bgAudio = document.getElementById('bg-audio');
  const audioToggleBtn = document.getElementById('audio-toggle');

  let currentCode = null;
  let currentUser = null;
  let hasPlayed = false;

  // Create 6 chests responsively
  function createChests(n = 6) {
    chestsContainer.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const div = document.createElement('div');
      div.className = 'chest';
      div.dataset.index = i;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-pressed', 'false');
      div.innerHTML = `
        ${chestSVG()}
        <div class="label">Baú ${i+1}</div>
      `;
      div.addEventListener('click', onChestClick);
      chestsContainer.appendChild(div);
    }
  }

  function chestSVG() {
    // compact SVG for chest (scales nicely)
    return `<svg viewBox="0 0 240 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="30" rx="12" ry="12" width="220" height="90" fill="#2f1414"/>
      <rect x="16" y="40" width="208" height="70" fill="#423838"/>
      <rect x="24" y="56" width="192" height="20" fill="#ffb84d"/>
      <ellipse cx="120" cy="115" rx="70" ry="10" fill="rgba(0,0,0,0.15)"/>
    </svg>`;
  }

  function log(message) {
    const el = document.createElement('div');
    el.textContent = `${new Date().toLocaleString()} — ${message}`;
    logEl.prepend(el);
  }

  function showToast(text, ms = 2200) {
    winEl.textContent = text;
    winEl.style.display = 'block';
    winEl.style.opacity = '1';
    setTimeout(() => {
      winEl.style.opacity = '0';
      setTimeout(() => winEl.style.display = 'none', 300);
    }, ms);
  }

  // Disable or enable chests
  function setChestsDisabled(disabled) {
    document.querySelectorAll('.chest').forEach(c => {
      if (disabled) {
        c.classList.add('disabled');
        c.setAttribute('aria-pressed', 'true');
      } else {
        c.classList.remove('disabled');
        c.setAttribute('aria-pressed', 'false');
        c.style.opacity = '1';
      }
    });
  }

  // Validate code (calls backend /api/redeem)
  async function validateCode(code) {
    try {
      const resp = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await resp.json();
      if (!resp.ok) throw data;
      return data;
    } catch (err) {
      throw err;
    }
  }

  // Play (call backend to consume code and reveal prize)
  async function play(code, username, chestIndex) {
    const resp = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, username, chestIndex })
    });
    const data = await resp.json();
    if (!resp.ok) throw data;
    return data;
  }

  // Handler for clicking Use Code
  useCodeBtn.addEventListener('click', async () => {
    const code = (codeInput.value || '').trim().toUpperCase();
    const username = (usernameInput.value || '').trim();
    if (!code) { alert('Digite o código.'); return; }
    if (!username) { alert('Digite seu nome para resgate.'); return; }
    try {
      useCodeBtn.disabled = true;
      useCodeBtn.textContent = 'Validando...';
      const data = await validateCode(code);
      currentCode = code;
      currentUser = username;
      hasPlayed = false;
      gameArea.style.display = 'block';
      locked.style.display = 'none';
      setChestsDisabled(false);
      // reset chest visuals
      document.querySelectorAll('.chest').forEach(c => {
        c.classList.remove('open');
        c.innerHTML = `${chestSVG()}<div class="label">Baú ${parseInt(c.dataset.index)+1}</div>`;
      });
      log(`Código ${code} válido. Jogador: ${username}. Abra um baú.`);
      showToast('Código válido! Abra 1 baú 🎃', 1800);
    } catch (err) {
      const msg = err && err.error ? err.error : 'Código inválido ou erro';
      alert(msg);
    } finally {
      useCodeBtn.disabled = false;
      useCodeBtn.textContent = 'Usar';
    }
  });

  // Chest click handler
  async function onChestClick(e) {
    if (!currentCode || !currentUser) { alert('Use um código e informe seu nome.'); return; }
    if (hasPlayed) { alert('Você já abriu um baú com esse código.'); return; }
    const chest = e.currentTarget;
    const index = chest.dataset.index;
    // immediate UI disable
    setChestsDisabled(true);
    // small open animation
    chest.classList.add('open');
    try {
      const data = await play(currentCode, currentUser, index);
      const prize = data.prize;
      // reveal prize inside chest
      chest.innerHTML = `<div style="background:#ffda6b;color:#150800;padding:8px;border-radius:8px;font-weight:800">${prize.label}</div>`;
      log(`Jogador ${currentUser} ganhou ${prize.label}`);
      showToast(`Você ganhou ${prize.label} 🎃`, 2600);
      hasPlayed = true;
      // clear current code to prevent accidental replays in UI
      currentCode = null;
      currentUser = null;
      codeInput.value = '';
      usernameInput.value = '';
      // optionally stop audio
      try { bgAudio.pause(); audioToggleBtnText(false); } catch(_) {}
    } catch (err) {
      // if error, re-enable chests if code still valid
      const msg = err && err.error ? err.error : 'Erro ao revelar prêmio';
      alert(msg);
      // re-enable to allow retry if appropriate
      setChestsDisabled(false);
      chest.classList.remove('open');
    }
  }

  // Audio controls
  function audioToggleBtnText(isPlaying) {
    audioToggleBtn.textContent = isPlaying ? '🔈 Pausar' : '🔊 Som';
  }
  const audioToggleBtn = document.getElementById('audio-toggle');
  audioToggleBtn.addEventListener('click', () => {
    if (bgAudio.paused) {
      bgAudio.play().catch(()=>{ /* autoplay blocked = ignore */ });
      audioToggleBtnText(true);
    } else {
      bgAudio.pause();
      audioToggleBtnText(false);
    }
  });

  // Init
  createChests(6);
  setChestsDisabled(true);
  bgAudio.pause();
  audioToggleBtnText(false);
  log('Bem-vindo — insira código e nome para começar.');

  // Accessibility: Enter key submits code
  [codeInput, usernameInput].forEach(inp => {
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') useCodeBtn.click();
    });
  });

})();