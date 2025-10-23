async function api(path, method='GET', body=null, adminPass=''){
  const headers = {};
  if(adminPass) headers['x-admin-password'] = adminPass;
  if(body) headers['Content-Type'] = 'application/json';
  const resp = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await resp.json();
  if(!resp.ok) throw data;
  return data;
}

const codesEl = document.getElementById('codes');
const genBtn = document.getElementById('gen-btn');
const listBtn = document.getElementById('list-btn');
const revokeBtn = document.getElementById('revoke-btn');
const logsBtn = document.getElementById('logs-btn');

function renderCodes(list){
  let html = '<table><thead><tr><th>Código</th><th>Usos</th><th>Expira</th><th>Prêmio</th></tr></thead><tbody>';
  list.forEach(c=>{
    const exp = c.expires_at ? new Date(c.expires_at).toLocaleString() : 'nunca';
    const premio = c.prize_value ? `${c.prize_label || ('R$' + Number(c.prize_value).toFixed(2))}` : '-';
    html += `<tr><td><strong>${c.code}</strong></td><td>${c.uses_count}/${c.uses_allowed}</td><td>${exp}</td><td>${premio}</td></tr>`;
  });
  html += '</tbody></table>';
  codesEl.innerHTML = html;
}

genBtn.addEventListener('click', async ()=>{
  const adminPass = document.getElementById('admin-pass').value.trim();
  if(!adminPass) return alert('Coloque a senha admin no campo');

  const count = parseInt(document.getElementById('count').value) || 1;
  const uses = parseInt(document.getElementById('uses').value) || 1;
  const days = parseInt(document.getElementById('days').value) || 30;
  const prizeValueRaw = document.getElementById('prize-value').value.trim();
  const prizeLabelRaw = document.getElementById('prize-label').value.trim();

  if(prizeValueRaw === '') return alert('Informe o valor do prêmio');

  const prize_value = Number(prizeValueRaw);
  const prize_label = prizeLabelRaw === '' ? `R$${prize_value.toFixed(2)}` : prizeLabelRaw;

  try{
    const res = await api('/admin/generate','POST',{
      count,
      uses_allowed: uses,
      expires_in_days: days,
      prize_value,
      prize_label
    }, adminPass);
    alert('Gerados: ' + res.count);
    listBtn.click();
  }catch(e){
    alert('Erro: ' + (e.error || JSON.stringify(e)));
  }
});

listBtn.addEventListener('click', async ()=>{
  const adminPass = document.getElementById('admin-pass').value.trim();
  if(!adminPass) return alert('Coloque a senha admin no campo');
  try{
    const res = await api('/admin/list','GET',null,adminPass);
    renderCodes(res.codes);
  }catch(e){
    alert('Erro: ' + (e.error || JSON.stringify(e)));
  }
});

revokeBtn.addEventListener('click', async ()=>{
  const adminPass = document.getElementById('admin-pass').value.trim();
  const code = document.getElementById('revoke-code').value.trim().toUpperCase();
  if(!adminPass) return alert('Coloque a senha admin no campo');
  if(!code) return alert('Cole o código para revogar');
  if(!confirm('Revogar ' + code + '?')) return;
  try{
    await api('/admin/revoke','POST',{ code }, adminPass);
    alert('Revogado: ' + code);
    listBtn.click();
  }catch(e){ alert('Erro: ' + (e.error || JSON.stringify(e))); }
});

logsBtn.addEventListener('click', async ()=>{
  const adminPass = document.getElementById('admin-pass').value.trim();
  if(!adminPass) return alert('Coloque a senha admin no campo');
  try{
    const res = await api('/admin/logs','GET',null,adminPass);
    let html = '<h3>Últimos prêmios</h3><table><thead><tr><th>Data</th><th>Código</th><th>Jogador</th><th>Prêmio</th></tr></thead><tbody>';
    res.logs.forEach(l=>{
      html += `<tr><td>${new Date(l.created_at).toLocaleString()}</td><td>${l.code}</td><td>${l.username}</td><td>${l.prize_label} (R$${Number(l.prize_value).toFixed(2)})</td></tr>`;
    });
    html += '</tbody></table>';
    codesEl.innerHTML = html;
  }catch(e){ alert('Erro: ' + (e.error || JSON.stringify(e))); }
});
