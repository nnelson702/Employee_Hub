/* global window, document */
const cfg = window.APP_CONFIG;
const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

// helpers
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
  m_txn: $('m_txn'),
  m_sales: $('m_sales'),
  m_margin: $('m_margin'),
  m_notes: $('m_notes'),
  btnCloseModal: $('btnCloseModal'),
  btnSaveModal: $('btnSaveModal'),
};

function setStatus(msg){ ui.status.textContent = msg; console.log('[STATUS]', msg); }
function setError(msg){ ui.status.textContent = '⚠️ ' + msg; console.error(msg); }
function fmt(n, d=0){ if(n===null||n===undefined||Number.isNaN(n)) return '—'; return Number(n).toLocaleString(undefined,{minimumFractionDigits:d, maximumFractionDigits:d}); }
function pct(a,b){ if(!b) return 0; return (a/b)*100; }

let session=null;
let edited={};
let active={ storeId:null, month:null, versionId:null, monthRows:[] };

function goalClass(actual, goal){
  if (goal <= 0) return '';
  if ((actual||0) >= goal) return 'hit';
  if ((actual||0) >= 0.95*goal) return 'miss';
  return 'fail';
}

// auth
async function refreshAuthUI(){
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
  if(!email || !password) return setError('Enter email and password.');
  ui.btnSignIn.disabled = true; setStatus('Signing in…');
  try{
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError('Sign-in failed: ' + error.message);
    await refreshAuthUI();
  }catch(e){ setError('Sign-in exception: ' + e.message); }
  finally{ ui.btnSignIn.disabled=false; }
};
ui.btnSignOut.onclick = async ()=>{ await supabase.auth.signOut(); await refreshAuthUI(); };

// stores
async function loadStores(){
  setStatus('Loading stores…');
  const { data, error } = await supabase.from('v_user_stores').select('*');
  if (error){ setError('Load stores failed: ' + error.message); return; }
  ui.storeSelect.innerHTML='';
  for (const r of data){
    const opt = document.createElement('option');
    opt.value = r.id || r.store_id || r.storeid || r.store; // flexible naming
    opt.textContent = `${opt.value} — ${r.name || r.store_name || ''}`;
    ui.storeSelect.appendChild(opt);
  }
  if (!ui.monthInput.value){
    ui.monthInput.value = new Date().toISOString().slice(0,7);
  }
  setStatus('Stores loaded.');
}
ui.btnLoad.onclick = ()=>{
  active.storeId = ui.storeSelect.value;
  active.month = ui.monthInput.value;
  if (!active.storeId || !active.month) return setError('Pick a store and month');
  loadMonth();
};

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

  // pad to weekday
  const firstDow = new Date(data[0].date+'T00:00:00').getDay();
  for (let i=0;i<firstDow;i++){ const pad=document.createElement('div'); pad.className='cell'; ui.calendar.appendChild(pad); }

  let mtTxnGoal=0, mtSalesGoal=0, mtTxnAct=0, mtSalesAct=0;

  for (const d of data){
    mtTxnGoal += d.txn_goal||0; mtSalesGoal += d.sales_goal||0;
    mtTxnAct += d.txn_actual||0; mtSalesAct += d.sales_actual||0;

    const cell = document.createElement('div');
    cell.className = 'cell ' + goalClass(d.sales_actual||0, d.sales_goal||0);
    cell.dataset.date = d.date;

    const top = document.createElement('div');
    top.className='date-row';
    top.innerHTML = `<div class="date">${d.date.slice(8)}</div><button class="drill" data-date="${d.date}">Details</button>`;
    cell.appendChild(top);

    const kpis = document.createElement('div');
    kpis.className='kpis';
    kpis.innerHTML = `
      <div class="kpi">Txn<b>${fmt(d.txn_actual)}<span class="goal"> / ${fmt(d.txn_goal)}</span></b></div>
      <div class="kpi">ATV<b>${fmt(d.atv_goal,2)}</b></div>
      <div class="kpi">Sales<b>${fmt(d.sales_actual,2)}<span class="goal"> / ${fmt(d.sales_goal,2)}</span></b></div>
    `;
    cell.appendChild(kpis);

    const inputs = document.createElement('div'); inputs.className='inputs';
    const iTxn = document.createElement('input'); iTxn.type='number'; iTxn.placeholder='Txn'; iTxn.value = d.txn_actual ?? '';
    const iSales = document.createElement('input'); iSales.type='number'; iSales.step='0.01'; iSales.placeholder='Sales'; iSales.value = d.sales_actual ?? '';
    inputs.appendChild(iTxn); inputs.appendChild(iSales);
    cell.appendChild(inputs);

    const markEdited = ()=>{
      edited[d.date] = {
        transactions: iTxn.value===''?null:Number(iTxn.value),
        net_sales: iSales.value===''?null:Number(iSales.value),
        gross_margin: (edited[d.date]?.gross_margin ?? null)
      };
    };
    iTxn.addEventListener('input', markEdited);
    iSales.addEventListener('input', markEdited);

    // open modal
    top.querySelector('.drill').addEventListener('click', ()=>openDayModal(d));

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

// modal
function openDayModal(d){
  ui.modalTitle.textContent = `${d.date} — Details`;
  ui.modalBadge.textContent = (d.sales_actual||0)>= (d.sales_goal||0) ? 'On / Above Goal' :
                              (d.sales_actual||0)>= 0.95*(d.sales_goal||0) ? 'Near Goal' : 'Below Goal';

  ui.modalKpis.innerHTML = `
    <div class="kpi">Txn Goal<b>${fmt(d.txn_goal)}</b></div>
    <div class="kpi">ATV Target<b>${fmt(d.atv_goal,2)}</b></div>
    <div class="kpi">Sales Goal<b>${fmt(d.sales_goal,2)}</b></div>
    <div class="kpi">Txn Actual<b>${fmt(d.txn_actual)}</b></div>
    <div class="kpi">Sales Actual<b>${fmt(d.sales_actual,2)}</b></div>
    <div class="kpi">To Goal<b>${fmt((d.sales_goal||0)-(d.sales_actual||0),2)}</b></div>
  `;

  ui.m_txn.value = d.txn_actual ?? '';
  ui.m_sales.value = d.sales_actual ?? '';
  ui.m_margin.value = d.margin_actual ?? '';

  ui.modal.classList.remove('hidden');
  ui.modal.setAttribute('aria-hidden','false');

  // Save single day
  ui.btnSaveModal.onclick = async ()=>{
    const row = {
      date: d.date,
      transactions: ui.m_txn.value===''?null:Number(ui.m_txn.value),
      net_sales: ui.m_sales.value===''?null:Number(ui.m_sales.value),
      gross_margin: ui.m_margin.value===''?null:Number(ui.m_margin.value)
    };
    try{
      setStatus('Saving day…');
      const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${cfg.SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ storeId: active.storeId, rows:[row] })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error||'Save failed');
      closeModal();
      await loadMonth();
      setStatus('Saved day.');
    }catch(e){ setError(e.message); }
  };
}
function closeModal(){ ui.modal.classList.add('hidden'); ui.modal.setAttribute('aria-hidden','true'); }
ui.btnCloseModal.onclick = closeModal;
ui.modal.addEventListener('click', (e)=>{ if(e.target===ui.modal) closeModal(); });

// save many edits
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

// init
(async ()=>{
  if(!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY){ setError('Missing config in public/config.js'); return; }
  setStatus('Initializing…');
  await refreshAuthUI();
  supabase.auth.onAuthStateChange(refreshAuthUI);
})();
