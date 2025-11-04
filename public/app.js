/* global window, document */
const cfg = window.APP_CONFIG;

// keep sessions non-persistent during build-out
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, storage: window.sessionStorage, autoRefreshToken: false }
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
  m_txn: $('m_txn'),        // reused DOM ids for save handling
  m_sales: $('m_sales'),
  m_margin: $('m_margin'),
  m_notes: $('m_notes'),
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
let edited={};
let active={ storeId:null, month:null, versionId:null, monthRows:[] };
let currentDay=null;

// ---------- AUTH ----------
async function refreshAuthUI(){
  hide(ui.modal); currentDay = null;

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
  edited={}; ui.calendar.innerHTML=''; ui.summary.textContent='Loading…'; setStatus(`Loading ${active.storeId} — ${active.month}`);
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

  let mtTxnGoal=0, mtSalesGoal=0, mtTxnAct=0, mtSalesAct=0;

  for (const d of data){
    mtTxnGoal += d.txn_goal||0; mtSalesGoal += d.sales_goal||0;
    mtTxnAct  += d.txn_actual||0; mtSalesAct  += d.sales_actual||0;

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

    // KPIs: cleaner, compact
    const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
    const kpis = document.createElement('div');
    kpis.className='kpis';
    kpis.innerHTML = `
      <div class="kpi">Txn<b>${fmt(d.txn_actual)} / ${fmt(d.txn_goal)}</b></div>
      <div class="kpi">ATV<b>${fmt(atvActual,2)} / ${fmt(d.atv_goal,2)}</b></div>
      <div class="kpi">Sales<b>${fmt(d.sales_actual,2)} / ${fmt(d.sales_goal,2)}</b></div>
    `;
    cell.appendChild(kpis);

    ui.calendar.appendChild(cell);
  }

  ui.summary.innerHTML = `
    <b>${active.storeId}</b> — ${active.month}
    &nbsp; | &nbsp; Txn: ${fmt(mtTxnAct)} / ${fmt(mtTxnGoal)} 
    &nbsp; | &nbsp; Sales: ${fmt(mtSalesAct,2)} / ${fmt(mtSalesGoal,2)}
    &nbsp; | &nbsp; ${fmt(pct(mtSalesAct, mtSalesGoal),0)}% to goal
  `;
  setStatus('Month loaded.');
}

// ---------- MODAL ----------
function pctText(actual, goal, d=0){
  const p = pct(actual, goal);
  return `${fmt(p, d)}%`;
}

function openDayModal(d){
  currentDay = d;

  const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual / d.txn_actual) : null;
  const marginPct = (d.sales_actual && d.margin_actual!=null) ? (d.margin_actual / d.sales_actual * 100) : null;

  ui.modalTitle.textContent = `${d.date} — Day details`;
  ui.modalBadge.textContent = ((d.sales_actual||0) >= (d.sales_goal||0) && (d.sales_goal||0)>0) ? 'On / Above Goal' : 'Below Goal';

  // Build grid per your spec:
  // Net Sales Goal, Projected Transactions, ATV Goal,
  // Net Sales Actual (editable), Actual Transactions (editable), Actual ATV (auto),
  // Margin $ (editable), Margin% (auto), % to goal for each (Sales/Txn/ATV)
  ui.modalKpis.innerHTML = `
    <div class="three-col">
      <div><label>Net Sales Goal ($)</label><input type="number" value="${d.sales_goal ?? ''}" readonly></div>
      <div><label>Projected Transactions</label><input type="number" value="${d.txn_goal ?? ''}" readonly></div>
      <div><label>ATV Goal ($)</label><input type="number" value="${d.atv_goal ?? ''}" readonly></div>
    </div>

    <div class="three-col">
      <div><label>Net Sales Actual ($)</label><input id="m_sales" type="number" step="0.01" value="${d.sales_actual ?? ''}"></div>
      <div><label>Actual Transactions</label><input id="m_txn" type="number" value="${d.txn_actual ?? ''}"></div>
      <div><label>Actual ATV ($)</label><input id="m_atv" type="number" step="0.01" value="${atvActual ?? ''}" readonly></div>
    </div>

    <div class="three-col">
      <div><label>Margin $</label><input id="m_margin" type="number" step="0.01" value="${d.margin_actual ?? ''}"></div>
      <div><label>Margin %</label><input id="m_margin_pct" type="number" step="0.01" value="${marginPct ?? ''}" readonly></div>
      <div><label>% to Goal (Sales / Txn / ATV)</label>
        <input id="m_to_goal" type="text" value="${
          `${fmt(pct(d.sales_actual, d.sales_goal),0)}% / ${fmt(pct(d.txn_actual, d.txn_goal),0)}% / ${fmt(pct(atvActual, d.atv_goal),0)}%`
        }" readonly>
      </div>
    </div>
  `;

  // wire dynamic updates inside modal
  const mSales  = document.getElementById('m_sales');
  const mTxn    = document.getElementById('m_txn');
  const mAtv    = document.getElementById('m_atv');
  const mMargin = document.getElementById('m_margin');
  const mMarginPct = document.getElementById('m_margin_pct');
  const mToGoal    = document.getElementById('m_to_goal');

  const recompute = ()=>{
    const s = Number(mSales.value||0);
    const t = Number(mTxn.value||0);
    const mg = Number(mMargin.value||0);
    // ATV actual
    mAtv.value = (t>0) ? (s/t).toFixed(2) : '';
    // Margin %
    mMarginPct.value = (s>0 && !Number.isNaN(mg)) ? (mg/s*100).toFixed(2) : '';
    // % to goal text
    const atvG = d.atv_goal||0, sG = d.sales_goal||0, tG = d.txn_goal||0;
    const atvA = (t>0) ? (s/t) : 0;
    mToGoal.value = `${fmt(pct(s, sG),0)}% / ${fmt(pct(t, tG),0)}% / ${fmt(pct(atvA, atvG),0)}%`;
  };
  mSales.addEventListener('input', recompute);
  mTxn.addEventListener('input', recompute);
  mMargin.addEventListener('input', recompute);

  // Save handler
  ui.btnSaveModal.onclick = async ()=>{
    ui.btnSaveModal.disabled = true;
    try{
      const row = {
        date: d.date,
        transactions: mTxn.value===''?null:Number(mTxn.value),
        net_sales:   mSales.value===''?null:Number(mSales.value),
        gross_margin:mMargin.value===''?null:Number(mMargin.value)
      };
      const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`, {
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
function closeModal(){ hide(ui.modal); currentDay=null; }
ui.btnCloseModal.addEventListener('click', closeModal);
ui.modal.addEventListener('click', (e)=>{ if(e.target===ui.modal) closeModal(); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !ui.modal.classList.contains('hidden')) closeModal(); });

// ---------- SAVE MANY (still available if we re-add inline editing later) ----------
ui.btnSave.onclick = async ()=>{
  const rows = Object.entries(edited).map(([date,vals])=>({ date, ...vals }));
  if (rows.length===0) return setStatus('No changes to save.');
  ui.btnSave.disabled=true; setStatus('Saving…');
  try{
    const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`,{
      method:'POST',
      headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${cfg.SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ storeId: active.storeId, rows })
    });
    const json = await resp.json();
    if(!resp.ok) throw new Error(json.error||'Save failed');
    edited={};
    await loadMonth();
    setStatus('Saved.');
  }catch(e){ setError('Save failed: '+e.message); }
  finally{ ui.btnSave.disabled=false; }
};

// ---------- boot ----------
(async ()=>{
  hide(ui.modal);
  setStatus('Initializing…');
  await refreshAuthUI();
})();
