/* global window, document */
const cfg = window.APP_CONFIG;

const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storage: window.localStorage, autoRefreshToken: true }
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

const setStatus = msg => ui.status.textContent = msg;
const setError  = msg => (ui.status.textContent = '⚠️ ' + msg, console.error(msg));

/* ---------- formatting (max 2 decimals everywhere, ints for counts) ---------- */
const fmt0 = n => (n===null||n===undefined||Number.isNaN(n)) ? '—' : Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
const fmt2 = n => (n===null||n===undefined||Number.isNaN(n)) ? '—' : Number(n).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:2});
const money = n => (n===null||n===undefined||Number.isNaN(n)) ? '—' : '$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

const hide = el => { el.classList.remove('open'); el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); };
const show = el => { el.classList.remove('hidden'); el.classList.add('open'); el.setAttribute('aria-hidden','false'); };
const percentClass = p => (p>=100?'ok':'bad');
const pct = (a,b)=>(!b||b===0)?0:(a/b)*100;
const hitBgClass = (actual, goal)=>((actual||0)>=(goal||0) && (goal||0)>0)?'bg-good':'bg-bad';

let active = { storeId:null, month:null, versionId:null, monthRows:[], totalGoal:0 };

function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
function isPastDate(iso){ const t = new Date(todayISO()); const d = new Date(iso+'T00:00:00'); return d < t; }
function isToday(iso){ return iso===todayISO(); }

/* ---------- AUTH ---------- */
async function refreshAuthUI(){
  hide(ui.modal);
  const { data, error } = await supabase.auth.getSession();
  if (error){ setError('Auth session error: '+error.message); return; }
  const session = data.session;
  if (session?.user){
    ui.loggedOut.classList.add('hidden');
    ui.loggedIn.classList.remove('hidden');
    ui.app.classList.remove('hidden');
    ui.whoami.textContent = session.user.email;
    setStatus('Signed in as '+session.user.email);
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
  ui.btnSignIn.disabled=true; setStatus('Signing in…');
  try{
    const { error } = await supabase.auth.signInWithPassword({ email,password });
    if (error) return setError('Sign-in failed: '+error.message);
    await refreshAuthUI();
  }catch(e){ setError('Sign-in exception: '+e.message); }
  finally{ ui.btnSignIn.disabled=false; }
};
ui.btnSignOut.onclick = async ()=>{ await supabase.auth.signOut(); await refreshAuthUI(); };

/* ---------- STORES ---------- */
async function loadStores(){
  setStatus('Loading stores…');
  const { data, error } = await supabase.from('v_user_stores').select('*');
  if (error){ setError('Load stores failed: '+error.message); return; }
  ui.storeSelect.innerHTML='';
  for (const r of data){
    const id = r.id || r.store_id || r.storeid || r.store;
    const name = r.name || r.store_name || '';
    const opt = document.createElement('option');
    opt.value=id; opt.textContent = `${id} — ${name}`;
    ui.storeSelect.appendChild(opt);
  }
  if (!ui.monthInput.value) ui.monthInput.value = new Date().toISOString().slice(0,7);
  setStatus('Stores loaded.');
}
ui.btnLoad.onclick = ()=>{ active.storeId = ui.storeSelect.value; active.month = ui.monthInput.value; if(!active.storeId||!active.month) return setError('Pick a store and month'); loadMonth(); };

/* ---------- CALENDAR RENDER ---------- */
function buildActualTile(d){
  const salePct = pct(d.sales_actual, d.sales_goal);
  const colorCls = salePct>=100 ? 'okc' : 'badc';
  const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual/d.txn_actual) : null;

  return `
    <div class="date-row">
      <div class="date">${d.date.slice(8)}</div>
      <button class="drill" type="button">Details</button>
    </div>
    <div class="lines actual">
      <div class="line"><span class="mono sale-big ${colorCls}">${money(d.sales_actual)}</span></div>
      <div class="line">
        <span class="mono txn-big">${fmt0(d.txn_actual)}</span>
        <span class="mono atv-side ${colorCls}">${atvActual!==null?money(atvActual):'—'}</span>
      </div>
      <div class="line center"><span class="mono pct-line ${colorCls}">${fmt2(salePct)}%</span></div>
    </div>
  `;
}

function buildGoalTile(d){
  const share = active.totalGoal>0 ? (d.sales_goal/active.totalGoal*100) : 0;
  return `
    <div class="date-row">
      <div class="date">${d.date.slice(8)}</div>
      <button class="drill" type="button">Details</button>
    </div>
    <div class="lines goal">
      <div class="line"><span class="mono sale-big">${money(d.sales_goal)}</span></div>
      <div class="line">
        <span class="mono txn-big">${fmt0(d.txn_goal)}</span>
        <span class="mono atv-side">${money(d.atv_goal)}</span>
      </div>
      <div class="line center"><span class="mono pct-line">${fmt2(share)}%</span></div>
    </div>
  `;
}

function updateCellInPlace(d){
  const showActuals = isPastDate(d.date) || (isToday(d.date) && (d.sales_actual||d.txn_actual));
  const cls = `cell ${showActuals ? hitBgClass(d.sales_actual, d.sales_goal) : ''}`.trim();
  let cell = document.getElementById(`cell-${d.date}`);
  if (!cell){
    cell = document.createElement('div');
    cell.id = `cell-${d.date}`;
    cell.dataset.date = d.date;
    ui.calendar.appendChild(cell);
  }
  cell.className = cls;
  cell.innerHTML = showActuals ? buildActualTile(d) : buildGoalTile(d);
  cell.querySelector('.drill').onclick = ()=>openDayModal({...d});
}

function recomputeSummary(){
  let totalGoal=0, mtdActual=0, elapsedGoal=0;
  const today = todayISO();

  for (const r of active.monthRows){
    totalGoal += r.sales_goal||0;
    mtdActual += r.sales_actual||0;
    if (r.date <= today) elapsedGoal += r.sales_goal||0;
  }
  active.totalGoal = totalGoal;

  const pctToGoal = pct(mtdActual, totalGoal);
  const trending = elapsedGoal>0 ? (mtdActual/elapsedGoal)*totalGoal : mtdActual;
  const trendingPct = pct(trending, totalGoal);

  ui.summary.innerHTML =
    `Sales: ${money(mtdActual)} / ${money(totalGoal)} &nbsp; | &nbsp; ${fmt2(pctToGoal)}% to Goal &nbsp; | &nbsp; ` +
    `Trending: ${money(trending)} / ${money(totalGoal)} &nbsp; | &nbsp; ${fmt2(trendingPct)}%`;
}

async function loadMonth(){
  ui.calendar.innerHTML=''; ui.summary.textContent='Loading…'; setStatus(`Loading ${active.storeId} — ${active.month}`);

  const { data, error } = await supabase.from('v_calendar_month')
    .select('*').eq('store_id', active.storeId).eq('month', active.month).order('date', { ascending:true });

  if (error){ setError('Load month failed: '+error.message); ui.summary.textContent='Failed to load month.'; return; }
  if (!data||data.length===0){ ui.summary.textContent='No forecast found for this month.'; setStatus('No forecast'); return; }

  active.versionId = data[0].version_id;
  active.monthRows = data;

  // pad for first weekday
  const firstDow = new Date(data[0].date+'T00:00:00').getDay();
  for (let i=0;i<firstDow;i++){ const pad=document.createElement('div'); pad.className='cell'; ui.calendar.appendChild(pad); }

  // summary/totals first (used by goal share %)
  recomputeSummary();

  for (const d of data){ updateCellInPlace(d); }

  setStatus('Month loaded.');
}

/* ---------- SAVE (edge function) ---------- */
async function upsertActuals(storeId, rows){
  const resp = await fetch(`${cfg.SUPABASE_URL}/functions/v1/upsert-actuals`,{
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${cfg.SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ storeId, rows })
  });
  const txt = await resp.text();
  let json; try{ json = txt ? JSON.parse(txt) : {}; }catch{ json = { raw:txt }; }
  if (!resp.ok) throw new Error(json?.error || json?.message || `Edge function failed (${resp.status})`);
  return json;
}

/* ---------- LY helper ---------- */
async function fetchLastYearActuals(storeId, isoDate){
  const lastYear = new Date(isoDate+'T00:00:00'); lastYear.setFullYear(lastYear.getFullYear()-1);
  const lyISO = lastYear.toISOString().slice(0,10);
  const { data, error } = await supabase
    .from('actual_daily')
    .select('transactions, net_sales')
    .eq('store_id', storeId)
    .eq('date', lyISO)
    .maybeSingle();
  if (error){ console.warn('LY fetch error', error.message); return { lyTxn:null, lySales:null, lyAtv:null }; }
  const lyTxn = data?.transactions ?? null;
  const lySales = data?.net_sales ?? null;
  const lyAtv = (lyTxn && lySales) ? (lySales/lyTxn) : null;
  return { lyTxn, lySales, lyAtv };
}

/* ---------- MODAL ---------- */
function openDayModal(d){
  const idx = active.monthRows.findIndex(r=>r.date===d.date);
  if (idx>=0) d = {...active.monthRows[idx]};

  const paintBadge = ()=>{ const p = pct(d.sales_actual, d.sales_goal); ui.modalBadge.textContent = (p>=100?'On / Above Goal':'Near Goal'); };
  ui.modalTitle.textContent = `${d.date} — Day details`;
  paintBadge();

  const atvActual = (d.txn_actual && d.sales_actual) ? (d.sales_actual/d.txn_actual) : null;
  const marginPct = (d.sales_actual && d.margin_actual!=null) ? (d.margin_actual/d.sales_actual*100) : null;

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
        <div id="txp" class="pct ${percentClass(pct(d.txn_actual,d.txn_goal))}">${fmt2(pct(d.txn_actual,d.txn_goal))}%</div>
        <div id="ly-txn" class="ly">LY: ${fmt0(null)}</div>
      </div>

      <div class="card" id="card-sales">
        <div class="card-title">Sales</div>
        <div class="pair">
          <div><div class="label">Goal ($)</div><input id="slg" class="pill" type="number" step="0.01" value="${d.sales_goal ?? ''}" readonly></div>
          <div><div class="label">Actual ($)</div><input id="sla" class="pill" type="number" step="0.01" value="${d.sales_actual ?? ''}"></div>
        </div>
        <div id="slp" class="pct ${percentClass(pct(d.sales_actual,d.sales_goal))}">${fmt2(pct(d.sales_actual,d.sales_goal))}%</div>
        <div id="ly-sales" class="ly">LY: ${money(null)}</div>
      </div>

      <div class="card" id="card-atv">
        <div class="card-title">ATV</div>
        <div class="pair">
          <div><div class="label">Goal ($)</div><input id="avg" class="pill" type="number" step="0.01" value="${d.atv_goal ?? ''}" readonly></div>
          <div><div class="label">Actual ($)</div><input id="ava" class="pill" type="number" step="0.01" value="${atvActual ?? ''}" readonly></div>
        </div>
        <div id="avp" class="pct ${percentClass(pct(atvActual,d.atv_goal))}">${fmt2(pct(atvActual,d.atv_goal))}%</div>
        <div id="ly-atv" class="ly">LY: ${money(null)}</div>
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

  const setPct = (el, val)=>{ el.textContent = `${fmt2(val)}%`; el.className = `pct ${percentClass(val)}`; };
  const recompute = ()=>{
    d.txn_actual    = txa.value===''?null:Number(txa.value);
    d.sales_actual  = sla.value===''?null:Number(Number(sla.value).toFixed(2));
    d.margin_actual = m$.value===''?null:Number(Number(m$.value).toFixed(2));
    const t = d.txn_actual ?? 0, s = d.sales_actual ?? 0, mg = d.margin_actual ?? 0;
    const atvA = (t>0)?(s/t):0;
    avA.value = t>0 ? Number(atvA).toFixed(2) : '';
    setPct(avp, pct(atvA, avg));
    mpc.value = (s>0 && mg!=null) ? Number(mg/s*100).toFixed(2) : '';
    setPct(txp, pct(t, txg));
    setPct(slp, pct(s, slg));
    const p = pct(d.sales_actual, d.sales_goal);
    ui.modalBadge.textContent = (p>=100?'On / Above Goal':'Near Goal');
  };
  txa.addEventListener('input', recompute);
  sla.addEventListener('input', recompute);
  m$.addEventListener('input', recompute);

  $('btnClear').onclick = ()=>{ txa.value=''; sla.value=''; m$.value=''; recompute(); };

  (async ()=>{
    const { lyTxn, lySales, lyAtv } = await fetchLastYearActuals(active.storeId, d.date);
    if (lyTxn!==null) $('ly-txn').textContent   = `LY: ${fmt0(lyTxn)}`;
    if (lySales!==null) $('ly-sales').textContent = `LY: ${money(lySales)}`;
    if (lyAtv!==null) $('ly-atv').textContent   = `LY: ${money(lyAtv)}`;
  })();

  ui.btnSaveModal.onclick = async ()=>{
    ui.btnSaveModal.disabled = true;
    try{
      await upsertActuals(active.storeId, [{
        date: d.date,
        transactions: d.txn_actual,
        net_sales: d.sales_actual,
        gross_margin: d.margin_actual
      }]);

      // Optimistic local update
      const i = active.monthRows.findIndex(x=>x.date===d.date);
      if (i>=0){
        active.monthRows[i] = { ...active.monthRows[i],
          txn_actual: d.txn_actual,
          sales_actual: d.sales_actual,
          margin_actual: d.margin_actual
        };
        updateCellInPlace(active.monthRows[i]);
        recomputeSummary();
      }

      hide(ui.modal);
      setStatus(`Saved actuals for ${d.date}`);
    }catch(e){ setError(e.message); }
    finally{ ui.btnSaveModal.disabled=false; }
  };

  show(ui.modal);
}

ui.btnCloseModal.addEventListener('click', ()=> hide(ui.modal));
ui.modal.addEventListener('click', (e)=>{ if(e.target===ui.modal) hide(ui.modal); });
window.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !ui.modal.classList.contains('hidden')) hide(ui.modal); });

/* ---------- boot ---------- */
(async ()=>{ hide(ui.modal); setStatus('Initializing…'); await refreshAuthUI(); })();
