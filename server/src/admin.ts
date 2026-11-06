// The admin page served at /admin (behind HTTP Basic auth). Values from the server are inserted with textContent only.
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MyGym licenses</title>
<style>
  :root { --bg:#F4F3EE; --card:#fff; --text:#15171C; --muted:#5B5F68; --border:#E4E2DA; --accent:#C2410C; --green:#15803D; --amber:#92400E; --red:#B91C1C; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:24px 16px 64px; display:flex; flex-direction:column; gap:20px; }
  h1 { font-size:26px; margin:0; } h2 { font-size:18px; margin:0 0 12px; }
  .card { background:var(--card); border-radius:16px; padding:18px; }
  .row { display:flex; flex-wrap:wrap; gap:10px; align-items:end; }
  label { display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600; }
  input, select { height:42px; border:1px solid var(--border); border-radius:10px; padding:0 12px; font:inherit; background:#fff; min-width:160px; }
  button { height:42px; border:0; border-radius:10px; padding:0 16px; font:inherit; font-weight:600; cursor:pointer; background:var(--text); color:#fff; }
  button.primary { background:var(--accent); }
  button.ghost { background:#fff; color:var(--text); border:1px solid var(--border); height:34px; padding:0 10px; font-size:13px; }
  button.ghost.danger { color:var(--red); }
  .muted { color:var(--muted); font-size:13px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .stat { background:var(--card); border-radius:14px; padding:14px; } .stat b { display:block; font-size:24px; }
  .tablewrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; color:var(--muted); font-weight:600; font-size:12px; padding:8px; border-bottom:1px solid var(--border); white-space:nowrap; }
  td { padding:10px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
  td.actions { display:flex; flex-wrap:wrap; gap:6px; }
  code { font-family:ui-monospace,Menlo,monospace; font-size:13px; background:#F4F3EE; padding:2px 6px; border-radius:6px; white-space:nowrap; }
  .pill { display:inline-block; font-size:12px; font-weight:600; padding:2px 8px; border-radius:10px; white-space:nowrap; }
  .ok { background:#DFF3E6; color:var(--green); } .warn { background:#FEF0D7; color:var(--amber); } .bad { background:#FDE2E2; color:var(--red); } .idle { background:#ECEAE3; color:var(--muted); }
  #newkey { display:none; margin-top:14px; padding:14px; border-radius:12px; background:#FEF0D7; }
  #newkey code { font-size:18px; }
  #msg { min-height:20px; }
</style>
</head>
<body>
<main>
  <div><h1>MyGym licenses</h1><div class="muted" id="today"></div></div>

  <div class="stats">
    <div class="stat"><span class="muted">Active licenses</span><b id="sActive">–</b></div>
    <div class="stat"><span class="muted">Phones on trial</span><b id="sTrial">–</b></div>
    <div class="stat"><span class="muted">Trial ended, not paid</span><b id="sExpired">–</b></div>
    <div class="stat"><span class="muted">Unused keys</span><b id="sUnused">–</b></div>
  </div>

  <div class="card">
    <h2>Create a license key</h2>
    <form id="create" class="row">
      <label>Plan<select name="plan"><option value="yearly">Yearly</option><option value="lifetime">Lifetime</option></select></label>
      <label>Gym / owner name<input name="client" required placeholder="Iron Fit, Ravi"></label>
      <label>WhatsApp number<input name="phone" placeholder="9876543210" inputmode="tel"></label>
      <label>Note<input name="note" placeholder="Paid ₹ via GPay on 6 Nov"></label>
      <button class="primary" type="submit">Create key</button>
    </form>
    <div id="newkey">
      <div class="muted">New key for <span id="nkClient"></span></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">
        <code id="nkKey"></code>
        <button class="ghost" type="button" id="nkCopy">Copy</button>
        <button class="ghost" type="button" id="nkWa">Send on WhatsApp</button>
      </div>
    </div>
    <div id="msg" class="muted"></div>
  </div>

  <div class="card">
    <h2>Plans & prices</h2>
    <p class="muted" style="margin-top:-6px">Shown on the app's License screen. Changes reach every phone the next time it opens the License screen.</p>
    <form id="plans" class="row">
      <label>Yearly price<input name="yearlyPrice" placeholder="₹500"></label>
      <label style="flex:1">Yearly description<input name="yearlySummary"></label>
      <label>Lifetime price<input name="lifetimePrice" placeholder="₹2,000"></label>
      <label style="flex:1">Lifetime description<input name="lifetimeSummary"></label>
      <label>UPI ID<input name="upi" placeholder="name@ybl"></label>
      <label>WhatsApp for payments<input name="whatsapp" placeholder="919876543210" inputmode="tel"></label>
      <label style="flex-basis:100%">How to pay (shown in the app)<input name="paymentInfo"></label>
      <button type="submit">Save plans</button>
    </form>
    <div id="plansMsg" class="muted"></div>
  </div>

  <div class="card">
    <h2>License keys</h2>
    <div class="row" style="margin-bottom:10px"><input id="q" placeholder="Search name, phone or key" style="flex:1"></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Key</th><th>Gym / owner</th><th>Plan</th><th>Status</th><th>Phone</th><th>Created</th><th></th></tr></thead>
      <tbody id="lics"></tbody>
    </table></div>
  </div>

  <div class="card">
    <h2>Phones</h2>
    <p class="muted" style="margin-top:-6px">Every phone that has opened MyGym. The trial starts the first time a phone opens the app.</p>
    <div class="tablewrap"><table>
      <thead><tr><th>Phone</th><th>First opened</th><th>Last seen</th><th>Trial</th><th>License</th><th></th></tr></thead>
      <tbody id="devs"></tbody>
    </table></div>
  </div>
</main>
<script>
const H = { 'content-type': 'application/json', 'x-admin': '1' };
let data = null;
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); for (const k of kids) if (k != null) e.append(k); return e; };
const fmt = (ms) => ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const pill = (cls, text) => el('span', { className: 'pill ' + cls, textContent: text });

async function api(path, body) {
  const r = await fetch(path, body === undefined ? { headers: H } : { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
  return j;
}

function licStatus(l) {
  if (l.revoked) return ['bad', 'Revoked'];
  if (!l.activatedAt) return ['idle', 'Not activated'];
  if (!l.device) return ['warn', 'Freed – waiting for new phone'];
  if (l.expires === null) return ['ok', 'Lifetime'];
  if (l.expires < data.today) return ['bad', 'Expired ' + fmtDay(l.expires)];
  return ['ok', 'Active till ' + fmtDay(l.expires)];
}

function waLink(phone, key, plan) {
  const text = 'Your MyGym ' + (plan === 'lifetime' ? 'lifetime' : 'yearly') + ' license key: ' + key + '\\n\\nOpen MyGym → Settings → License → Enter key.';
  const num = String(phone || '').replace(/\\D/g, '');
  const to = num.length === 10 ? '91' + num : num;
  return 'https://wa.me/' + to + '?text=' + encodeURIComponent(text);
}

async function act(path, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  try { await api(path, {}); await load(); } catch (e) { alert(e.message); }
}

function render() {
  const q = $('q').value.trim().toLowerCase();
  const devById = Object.fromEntries(data.devices.map((d) => [d.id, d]));
  const lics = $('lics'); lics.replaceChildren();
  for (const l of data.licenses) {
    if (q && ![l.key, l.client, l.phone, l.note].join(' ').toLowerCase().includes(q)) continue;
    const [cls, text] = licStatus(l);
    const actions = el('td', { className: 'actions' });
    actions.append(el('button', { className: 'ghost', textContent: 'Copy', onclick: () => navigator.clipboard.writeText(l.key) }));
    actions.append(el('button', { className: 'ghost', textContent: 'WhatsApp', onclick: () => window.open(waLink(l.phone, l.key, l.plan), '_blank') }));
    if (l.device) actions.append(el('button', { className: 'ghost', textContent: 'Move to new phone', onclick: () => act('/admin/api/licenses/' + l.key + '/reset', 'Free this key so it can be activated on a different phone? The current phone loses the license. The expiry date stays the same.') }));
    if (!l.revoked) actions.append(el('button', { className: 'ghost danger', textContent: 'Revoke', onclick: () => act('/admin/api/licenses/' + l.key + '/revoke', 'Revoke ' + l.key + '? The app on that phone will stop allowing changes.') }));
    else actions.append(el('button', { className: 'ghost', textContent: 'Restore', onclick: () => act('/admin/api/licenses/' + l.key + '/restore') }));
    if (!l.activatedAt) actions.append(el('button', { className: 'ghost danger', textContent: 'Delete', onclick: () => act('/admin/api/licenses/' + l.key + '/delete', 'Delete unused key ' + l.key + '?') }));
    lics.append(el('tr', {},
      el('td', {}, el('code', { textContent: l.key })),
      el('td', {}, el('div', { textContent: l.client }), el('div', { className: 'muted', textContent: [l.phone, l.note].filter(Boolean).join(' · ') })),
      el('td', { textContent: l.plan === 'lifetime' ? 'Lifetime' : 'Yearly' }),
      el('td', {}, pill(cls, text)),
      el('td', { className: 'muted', textContent: l.model || (l.device ? l.device.slice(0, 8) : '–') }),
      el('td', { className: 'muted', textContent: fmt(l.createdAt) }),
      actions));
  }
  if (!lics.children.length) lics.append(el('tr', {}, el('td', { colSpan: 7, className: 'muted', textContent: 'No license keys yet.' })));

  const licByKey = Object.fromEntries(data.licenses.map((l) => [l.key, l]));
  const devs = $('devs'); devs.replaceChildren();
  for (const d of data.devices) {
    const lic = d.license ? licByKey[d.license] : null;
    const onTrial = d.trialEnds >= data.today;
    devs.append(el('tr', {},
      el('td', {}, el('div', { textContent: d.model || 'Android phone' }), el('div', { className: 'muted', textContent: d.id.slice(0, 12) + (d.app ? ' · v' + d.app : '') })),
      el('td', { className: 'muted', textContent: fmt(d.firstSeen) }),
      el('td', { className: 'muted', textContent: fmt(d.lastSeen) }),
      el('td', {}, pill(onTrial ? 'warn' : 'idle', (onTrial ? 'Ends ' : 'Ended ') + fmtDay(d.trialEnds))),
      el('td', {}, lic ? el('div', {}, el('code', { textContent: lic.key }), el('div', { className: 'muted', textContent: lic.client })) : el('span', { className: 'muted', textContent: '–' })),
      el('td', { className: 'actions' }, el('button', { className: 'ghost', textContent: 'Extend trial 7 days', onclick: () => act('/admin/api/devices/' + encodeURIComponent(d.id) + '/extend-trial') }))));
  }
  if (!devs.children.length) devs.append(el('tr', {}, el('td', { colSpan: 6, className: 'muted', textContent: 'No phones have opened the app yet.' })));

  const activeLic = data.licenses.filter((l) => !l.revoked && l.device && (l.expires === null || l.expires >= data.today));
  const paidDevices = new Set(activeLic.map((l) => l.device));
  $('sActive').textContent = activeLic.length;
  $('sTrial').textContent = data.devices.filter((d) => d.trialEnds >= data.today && !paidDevices.has(d.id)).length;
  $('sExpired').textContent = data.devices.filter((d) => d.trialEnds < data.today && !paidDevices.has(d.id)).length;
  $('sUnused').textContent = data.licenses.filter((l) => !l.activatedAt && !l.revoked).length;
  $('today').textContent = 'Today (IST): ' + fmtDay(data.today) + (data.paymentInfo ? ' · ' + data.paymentInfo : '');
}

let plansFilled = false;
function fillPlans() {
  if (plansFilled || !data.config) return;
  const f = $('plans');
  for (const [k, v] of Object.entries(data.config)) if (f.elements[k]) f.elements[k].value = v;
  plansFilled = true;
}

async function load() {
  try { data = await api('/admin/api/data'); render(); fillPlans(); } catch (e) { $('msg').textContent = e.message; }
}

$('plans').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('/admin/api/config', Object.fromEntries(new FormData(ev.target)));
    $('plansMsg').textContent = 'Saved. Phones see the new plans next time they open the License screen.';
    await load();
  } catch (e) { $('plansMsg').textContent = e.message; }
});

$('create').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    const l = await api('/admin/api/licenses', Object.fromEntries(f));
    $('nkKey').textContent = l.key; $('nkClient').textContent = l.client + ' (' + (l.plan === 'lifetime' ? 'Lifetime' : 'Yearly') + ')';
    $('nkCopy').onclick = () => navigator.clipboard.writeText(l.key);
    $('nkWa').onclick = () => window.open(waLink(l.phone, l.key, l.plan), '_blank');
    $('newkey').style.display = 'block'; $('msg').textContent = '';
    ev.target.reset();
    await load();
  } catch (e) { $('msg').textContent = e.message; }
});
$('q').addEventListener('input', () => data && render());
load();
</script>
</body>
</html>`;
