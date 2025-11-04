/* global window, document */
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession:false, storage:window.sessionStorage, autoRefreshToken:false }
});

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
  calendar: $('calendar'),
  summary: $('summary'),
  modal: $('dayModal'),
  modalTitle: $('modalTitle'),
  modalBadge: $('modalBadge'),
  modalKpis: $('modalKpis'),
  btnCloseModal: $('btnCloseModal'),
  btnSaveModal: $('btnSaveModal'),
};

const setStatus = (msg)=> ui.status.textContent = msg;
const setError  = (msg)=> (ui.status.textContent = '⚠️ ' + msg, console.error(msg));
const fmt = (n,d=0)=> (n===null||n===undefined||Number.isNaN(n)) ? '—' :
  Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = (a,b)=> (!b || b===0) ? 0 : (a/b)*100;
const hide = el => { el.classList.remove('open'); el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); };
const show = el => { el.classList.remove('hidden'); el.classList.add('open'); el.setAttribute('aria-hidden','false'); };
const percentClass = p => (p>=100 ? 'ok' : 'bad');

let active={ storeId:null, month:null, versionId:null, monthRows:[] };

// ---------- AUTH ----------
async function refreshAuthUI(){
  hide(ui.modal);
  const { data, error } = await supabase.auth.getSession();
  if (error){ setError('Auth session error: ' + error.message); return; }
  const session = data.session;
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

  const firstDow = new Date(data[0].date+'T00:00:00').getDay();
  for (let i=0;i<firstDow;i++){ const pad=document.createElement('div'); pad.className='cell'; ui.calendar.appendChild(pad); }

  let mtSalesGoal=0, mtSalesAct=0;

  for (const d of data){
    mtSalesGoal += d.sales_goal||0;
    mtSalesAct  += d.sales_actual||0;

    const cell = document.createElement('div');
    cell.className = `cell ${bgClassForDay(d.sales_actual, d.sales_goal)}`;
    const top = document.createElement('div');
    top.className='date-row';
    const btn = document.createElement('button');
    btn.className='drill'; btn.type='button'; btn.textContent='Details';
    btn.addEventListener('click', ()=>openDayModal(d));
    top.innerHTML = `<div class="date">${d.date.slice(8)}</div>`;
    top.appendChild(btn);
    cell.appendChild(top);

    const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
    const lines = document.createElement('div');
    lines.className='lines';
    lines.innerHTML = `
      <div class="line"><span class="mono">${fmt(d.sales_goal,2)}</span></div>
      <div class="line"><span class="mono">${fmt(d.txn_goal)}</span></div>
      <div class="line"><span class="mono">${fmt(d.atv_goal,2)}${atvActual!==null?` • ${fmt(atvActual,2)}`:''}</span></div>
      ${d.sales_actual ? `<div class="line"><span class="mono">${fmt(pct(d.sales_actual, d.sales_goal),2)}%</span></div>` : ``}
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

// ---------- SAVE via Edge Function (service role) ----------
async function upsertActuals(storeId, rows){
  const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`,{
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${cfg.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ storeId, rows })
  });
  const text = await resp.text();
  let json; try{ json = text ? JSON.parse(text) : {}; }catch{ json = { raw:text }; }
  if (!resp.ok) throw new Error(json?.error || json?.message || `Edge function failed (${resp.status})`);
  return json;
}

// ---------- MODAL ----------
function openDayModal(d){
  ui.modalTitle.textContent = `${d.date} — Day details`;
  const pSales = pct(d.sales_actual, d.sales_goal);
  ui.modalBadge.textContent = (pSales >= 100) ? 'On / Above Goal' : (pSales >= 95 ? 'Near Goal' : 'Below Goal');

  const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
  const marginPct = (d.sales_actual && d.margin_actual!=null) ? (d.margin_actual / d.sales_actual * 100) : null;

  ui.modalKpis.innerHTML = `
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="btnClear" class="ghost" type="button">Clear all</button>
    </div>

    <div class="columns">

      <div class="card" id="card-txn">
        <div class="card-title">Transactions</div>
        <div class="pair">
          <div><div class="label">Goal</div><input id="txg" class="pill" type="number" value="${d.txn_goal ?? ''}" readonly></div>
          <div><div class="label">Actual</div><input id="txa" class="pill" type="number" value="${d.txn_actual ?? ''}"></div>
        </div>
        <div id="txp" class="pct ${percentClass(pct(d.txn_actual,d.txn_goal))}">${fmt(pct(d.txn_actual,d.txn_goal),2)}%</div>
      </div>

      <div class="card" id="card-sales">
        <div class="card-title">Sales</div>
        <div class="pair">
          <div><div class="label">Goal ($)</div><input id="slg" class="pill" type="number" step="0.01" value="${d.sales_goal ?? ''}" readonly></div>
          <div><div class="label">Actual ($)</div><input id="sla" class="pill" type="number" step="0.01" value="${d.sales_actual ?? ''}"></div>
        </div>
        <div id="slp" class="pct ${percentClass(pct(d.sales_actual,d.sales_goal))}">${fmt(pct(d.sales_actual,d.sales_goal),2)}%</div>
      </div>

      <div class="card" id="card-atv">
        <div class="card-title">ATV</div>
        <div class="pair">
          <div><div class="label">Goal ($)</div><input id="avg" class="pill" type="number" step="0.01" value="${d.atv_goal ?? ''}" readonly></div>
          <div><div class="label">Actual ($)</div><input id="ava" class="pill" type="number" step="0.01" value="${atvActual ?? ''}" readonly></div>
        </div>
        <div id="avp" class="pct ${percentClass(pct(atvActual,d.atv_goal))}">${fmt(pct(atvActual,d.atv_goal),2)}%</div>
      </div>

      <div class="card" id="card-margin">
        <div class="card-title">Margin</div>
        <div class="pair">
          <div><div class="label">Margin %</div><input id="mpc" class="pill" type="number" step="0.01" value="${marginPct ?? ''}" readonly></div>
          <div><div class="label">Margin $</div><input id="m$" class="pill" type="number" step="0.01" value="${d.margin_actual ?? ''}"></div>
        </div>
      </div>

    </div>

    <div class="notes">Notes (coming soon—will save to Day Notes)</div>
  `;

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

  const setPct = (el, val)=>{ el.textContent = `${fmt(val,2)}%`; el.className = `pct ${percentClass(val)}`; };
  const recompute = ()=>{
    const t = Number(txa.value||0);
    const s = Number(sla.value||0);
    const mg= Number(m$.value||0);
    const atvA = (t>0) ? (s/t) : 0;
    avA.value = t>0 ? atvA.toFixed(4) : '';
    setPct(avp, pct(atvA, avg));
    mpc.value = (s>0) ? (mg/s*100).toFixed(4) : '';
    setPct(txp, pct(t, txg));
    setPct(slp, pct(s, slg));
  };
  txa.addEventListener('input', recompute);
  sla.addEventListener('input', recompute);
  m$.addEventListener('input', recompute);

  $('btnClear').onclick = ()=>{ txa.value=''; sla.value=''; m$.value=''; recompute(); };

  ui.btnSaveModal.onclick = async ()=>{
    ui.btnSaveModal.disabled = true;
    try{
      const rows = [{
        date: d.date,
        transactions: txa.value===''?null:Number(txa.value),
        net_sales:   sla.value===''?null:Number(sla.value),
        gross_margin:m$.value===''?null:Number(m$.value)
      }];

      await upsertActuals(active.storeId, rows);

      // verify persisted
      const { data:verify, error:vErr } = await supabase
        .from('actual_daily')
        .select('transactions,net_sales,gross_margin')
        .eq('store_id', active.storeId).eq('date', d.date).maybeSingle();
      if (vErr) throw new Error('Verify read failed: ' + vErr.message);
      if (!verify) throw new Error('Save appears to have failed (no row)');

      hide(ui.modal);
      await loadMonth();
      setStatus(`Saved actuals for ${d.date}`);
    }catch(e){ setError(e.message); }
    finally{ ui.btnSaveModal.disabled=false; }
  };

  show(ui.modal);
}

ui.btnCloseModal.addEventListener('click', ()=> hide(ui.modal));
ui.modal.addEventListener('click', (e)=>{ if(e.target===ui.modal) hide(ui.modal); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !ui.modal.classList.contains('hidden')) hide(ui.modal); });

// boot
(async ()=>{ hide(ui.modal); setStatus('Initializing…'); await refreshAuthUI(); })();
