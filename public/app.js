/* global window, document */
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession:false, storage:window.sessionStorage, autoRefreshToken:false }
});

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const ui = {
  status: $('status'),
  loggedOut: $('logged-out'),
  loggedIn: $('logged-in'),
  whoami: $('whoami'),
  email: $('email'),
  password: $('password'),
  btnSignIn: $('btn-signin'),
  btnSignOut: $('btn-signout'),
  app: $('app'),
  storeSelect: $('storeSelect'),
  monthInput: $('monthInput'),
  btnLoad: $('btn-load'),
  btnSave: $('btn-save'),
  calendar: $('calendar'),
  summary: $('summary'),
  // modal
  modal: $('dayModal'),
  modalTitle: $('modalTitle'),
  modalBadge: $('modalBadge'),
  modalKpis: $('modalKpis'),
  btnCloseModal: $('btnCloseModal'),
  btnSaveModal: $('btnSaveModal'),
};
const setStatus = msg => (ui.status.textContent = msg);
const setError  = msg => (ui.status.textContent = '⚠️ ' + msg, console.error(msg));
const fmt = (n,d=0)=> (n===null||n===undefined||Number.isNaN(n)) ? '—' :
  Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (a,b)=> (!b || b===0) ? 0 : (a/b)*100;
const hide = el => { el.classList.remove('open'); el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); };
const show = el => { el.classList.remove('hidden'); el.classList.add('open'); el.setAttribute('aria-hidden','false'); };

// state
let session=null;
let active={ storeId:null, month:null, versionId:null, monthRows:[] };

// ---------- AUTH ----------
async function refreshAuthUI(){
  hide(ui.modal);
  const { data, error } = await supabase.auth.getSession();
  if (error){ setError('Auth session error: ' + error.message); return; }
  session = data.session;

  if (session?.user){
    ui.loggedOut.classList.add('hidden');
    ui.loggedIn.classList.remove('hidden');
    ui.app.classList.remove('hidden');
    ui.whoami.textContent = session.user.email;
    setStatus('Signed in as ' + session.user.email);
    await loadStores();
  }else{
    ui.loggedOut.classList.remove('hidden');
    ui.loggedIn.classList.add('hidden');
    ui.app.classList.add('hidden');
    setStatus('Not signed in.');
  }
}
ui.btnSignIn.onclick = async ()=>{
  const email = ui.email.value.trim(), password = ui.password.value;
  if (!email || !password) return setError('Enter email and password.');
  ui.btnSignIn.disabled = true; setStatus('Signing in…');
  try{
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError('Sign-in failed: ' + error.message);
    await refreshAuthUI();
  }catch(e){ setError('Sign-in exception: ' + e.message); }
  finally{ ui.btnSignIn.disabled=false; }
};
ui.btnSignOut.onclick = async ()=>{ await supabase.auth.signOut(); await refreshAuthUI(); };

// ---------- STORES ----------
async function loadStores(){
  setStatus('Loading stores…');
  const { data, error } = await supabase.from('v_user_stores').select('*');
  if (error){ setError('Load stores failed: ' + error.message); return; }
  ui.storeSelect.innerHTML='';
  for (const r of data){
    const id = r.id || r.store_id || r.storeid || r.store;
    const name = r.name || r.store_name || '';
    const opt = document.createElement('option');
    opt.value = id; opt.textContent = `${id} — ${name}`;
    ui.storeSelect.appendChild(opt);
  }
  if (!ui.monthInput.value) ui.monthInput.value = new Date().toISOString().slice(0,7);
  setStatus('Stores loaded.');
}
ui.btnLoad.onclick = ()=>{
  active.storeId = ui.storeSelect.value;
  active.month   = ui.monthInput.value;
  if (!active.storeId || !active.month) return setError('Pick a store and month');
  loadMonth();
};

// ---------- MONTH VIEW ----------
function bgClassForDay(salesActual, salesGoal){
  const hit = (salesActual||0) >= (salesGoal||0) && (salesGoal||0) > 0;
  return hit ? 'bg-good' : 'bg-bad';
}

async function loadMonth(){
  ui.calendar.innerHTML=''; ui.summary.textContent='Loading…'; setStatus(`Loading ${active.storeId} — ${active.month}`);
  const { data, error } = await supabase.from('v_calendar_month')
    .select('*')
    .eq('store_id', active.storeId)
    .eq('month', active.month)
    .order('date', { ascending:true });
  if (error){ setError('Load month failed: ' + error.message); ui.summary.textContent='Failed to load month.'; return; }
  if (!data || data.length===0){ ui.summary.textContent='No forecast found for this month.'; setStatus('No forecast for month'); return; }

  active.versionId = data[0].version_id;
  active.monthRows = data;

  // pad leading blanks
  const firstDow = new Date(data[0].date+'T00:00:00').getDay();
  for (let i=0;i<firstDow;i++){ const pad=document.createElement('div'); pad.className='cell'; ui.calendar.appendChild(pad); }

  let mtSalesGoal=0, mtSalesAct=0;

  for (const d of data){
    mtSalesGoal += d.sales_goal||0;
    mtSalesAct  += d.sales_actual||0;

    const cell = document.createElement('div');
    cell.className = `cell ${bgClassForDay(d.sales_actual, d.sales_goal)}`;
    cell.dataset.date = d.date;

    const top = document.createElement('div');
    top.className='date-row';
    const btn = document.createElement('button');
    btn.className='drill'; btn.type='button'; btn.textContent='Details';
    btn.addEventListener('click', ()=>openDayModal(d));
    top.innerHTML = `<div class="date">${d.date.slice(8)}</div>`;
    top.appendChild(btn);
    cell.appendChild(top);

    // LINES (no labels):
    // 1) Sales Goal
    // 2) Txn Goal
    // 3) ATV Goal & ATV Actual (if available)
    // 4) % to Sales Goal (only if actuals exist)
    const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
    const lines = document.createElement('div');
    lines.className='lines';
    lines.innerHTML = `
      <div class="line"><span class="mono">${fmt(d.sales_goal,2)}</span></div>
      <div class="line"><span class="mono">${fmt(d.txn_goal)}</span></div>
      <div class="line"><span class="mono">${fmt(d.atv_goal,2)}${atvActual!==null?` • ${fmt(atvActual,2)}`:''}</span></div>
      ${d.sales_actual ? `<div class="line"><span class="mono">${fmt(pct(d.sales_actual, d.sales_goal),0)}%</span></div>` : ``}
    `;
    cell.appendChild(lines);

    ui.calendar.appendChild(cell);
  }

  ui.summary.innerHTML = `
    <b>${active.storeId}</b> — ${active.month}
    &nbsp; | &nbsp; Sales: ${fmt(mtSalesAct,2)} / ${fmt(mtSalesGoal,2)}
    &nbsp; | &nbsp; ${fmt(pct(mtSalesAct, mtSalesGoal),0)}% to goal
  `;
  setStatus('Month loaded.');
}

// ---------- MODAL (columnar: Txn / Sales / ATV / Margin) ----------
function openDayModal(d){
  ui.modalTitle.textContent = `${d.date} — Details`;
  const pSales = pct(d.sales_actual, d.sales_goal);
  ui.modalBadge.textContent = (pSales >= 100) ? 'On / Above Goal' : (pSales >= 95 ? 'Near Goal' : 'Below Goal') ;

  const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
  const marginPct = (d.sales_actual && d.margin_actual!=null) ? (d.margin_actual / d.sales_actual * 100) : null;

  // Build four vertical columns
  ui.modalKpis.innerHTML = `
    <div class="columns">

      <!-- Transactions -->
      <div class="card" id="col-txn">
        <div class="row">
          <div>
            <label>Goal</label>
            <input id="txg" type="number" value="${d.txn_goal ?? ''}" readonly>
          </div>
          <div>
            <label>Actual</label>
            <input id="txa" type="number" value="${d.txn_actual ?? ''}">
          </div>
        </div>
        <div class="foot" id="txp">% to goal: ${fmt(pct(d.txn_actual, d.txn_goal),0)}%</div>
      </div>

      <!-- Sales -->
      <div class="card" id="col-sales">
        <div class="row">
          <div>
            <label>Goal ($)</label>
            <input id="slg" type="number" step="0.01" value="${d.sales_goal ?? ''}" readonly>
          </div>
          <div>
            <label>Actual ($)</label>
            <input id="sla" type="number" step="0.01" value="${d.sales_actual ?? ''}">
          </div>
        </div>
        <div class="foot" id="slp">% to goal: ${fmt(pct(d.sales_actual, d.sales_goal),0)}%</div>
      </div>

      <!-- ATV -->
      <div class="card" id="col-atv">
        <div class="row">
          <div>
            <label>Goal ($)</label>
            <input id="avg" type="number" step="0.01" value="${d.atv_goal ?? ''}" readonly>
          </div>
          <div>
            <label>Actual ($)</label>
            <input id="ava" type="number" step="0.01" value="${atvActual ?? ''}" readonly>
          </div>
        </div>
        <div class="foot" id="avp">% to goal: ${fmt(pct(atvActual, d.atv_goal),0)}%</div>
      </div>

      <!-- Margin (no % to goal footer) -->
      <div class="card" id="col-margin">
        <div class="row">
          <div>
            <label>Margin %</label>
            <input id="mpc" type="number" step="0.01" value="${marginPct ?? ''}" readonly>
          </div>
          <div>
            <label>Margin $</label>
            <input id="m$" type="number" step="0.01" value="${d.margin_actual ?? ''}">
          </div>
        </div>
      </div>

    </div>
  `;

  // Elements
  const txa = document.getElementById('txa');
  const sla = document.getElementById('sla');
  const m$  = document.getElementById('m$');
  const txg = Number((document.getElementById('txg').value)||0);
  const slg = Number((document.getElementById('slg').value)||0);
  const avg = Number((document.getElementById('avg').value)||0);
  const avA = document.getElementById('ava');
  const mpc = document.getElementById('mpc');
  const txp = document.getElementById('txp');
  const slp = document.getElementById('slp');
  const avp = document.getElementById('avp');

  const recompute = ()=>{
    const t = Number(txa.value||0);
    const s = Number(sla.value||0);
    const mg= Number(m$.value||0);

    // ATV actual & % to goal
    const atvA = (t>0) ? (s/t) : 0;
    avA.value = t>0 ? atvA.toFixed(2) : '';
    avp.textContent = `% to goal: ${fmt(pct(atvA, avg),0)}%`;

    // Margin %
    mpc.value = (s>0) ? (mg/s*100).toFixed(2) : '';

    // Percent to goal rows
    txp.textContent = `% to goal: ${fmt(pct(t, txg),0)}%`;
    slp.textContent = `% to goal: ${fmt(pct(s, slg),0)}%`;
  };
  txa.addEventListener('input', recompute);
  sla.addEventListener('input', recompute);
  m$.addEventListener('input', recompute);

  // Save
  ui.btnSaveModal.onclick = async ()=>{
    ui.btnSaveModal.disabled = true;
    try{
      const row = {
        date: d.date,
        transactions: txa.value===''?null:Number(txa.value),
        net_sales:   sla.value===''?null:Number(sla.value),
        gross_margin:m$.value===''?null:Number(m$.value)
      };
      const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`,{
        method:'POST',
        headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ storeId: active.storeId, rows:[row] })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error||'Save failed');
      closeModal();
      await loadMonth();
      setStatus('Saved day.');
    }catch(e){ setError(e.message); }
    finally{ ui.btnSaveModal.disabled=false; }
  };

  show(ui.modal);
}
function closeModal(){ hide(ui.modal); }
ui.btnCloseModal.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e)=>{ if(e.target===ui.modal) closeModal(); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !ui.modal.classList.contains('hidden')) closeModal(); });

// ---------- boot ----------
(async ()=>{
  hide(ui.modal);
  setStatus('Initializing…');
  await refreshAuthUI();
})();
