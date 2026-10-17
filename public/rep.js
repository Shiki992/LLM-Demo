const $ = s => document.querySelector(s);
let tickets = [], selected = location.hash.slice(1) || null, lastSig = '', draftDirty = false;

const STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'researching', label: 'AI · Research & score' },
  { key: 'cart_check', label: 'Cart check' },
  { key: 'routed', label: 'Routed' },
];
const STEP_INDEX = { received: 0, sent_to_n8n: 0, researching: 1, cart_check: 2, routed: 3 };
const NOW_DOING = { received: 'Waiting for n8n…', sent_to_n8n: 'Looking up company…', researching: 'AI is researching & scoring…', cart_check: 'Checking cart, routing…' };
const DONE = ['sent', 'closed'];

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}
function toast(msg) {
  const t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3200);
}
const clock = iso => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}
const scorePill = s => s ? `<span class="pill ${esc(s)}"><span class="dot"></span>${esc(String(s).toUpperCase())}</span>` : '';
const cartPill = t => t.cart ? (t.cart.items.length ? `<span class="pill">Cart · ${money(t.cart.total)}</span>` : `<span class="pill">No cart</span>`) : '';
function laneOf(t) {
  if (!t.route || t.status === 'error') return 'flight';
  return t.route;
}

// ---------- board ----------
function renderBoard() {
  const lanes = { flight: [], approval: [], rep: [], nurture: [] };
  for (const t of tickets) (lanes[laneOf(t)] || lanes.flight).push(t);
  for (const [lane, list] of Object.entries(lanes)) {
    const el = document.querySelector(`[data-lane="${lane}"]`);
    el.querySelector('.n').textContent = list.filter(t => !DONE.includes(t.status)).length;
    list.sort((a, b) => DONE.includes(a.status) - DONE.includes(b.status));
    el.querySelector('.cards').innerHTML = list.length ? list.map(card).join('') : `<div class="empty">${lane === 'flight' ? 'Submit an inquiry from the storefront to start' : 'Nothing here yet'}</div>`;
  }
  const open = tickets.filter(t => !DONE.includes(t.status));
  $('#stats').innerHTML = `
    <span class="stat"><b>${tickets.length}</b>inquiries</span>
    <span class="stat"><b>${tickets.filter(t => t.score === 'hot').length}</b>hot</span>
    <span class="stat"><b>${open.filter(t => t.route === 'approval').length}</b>drafts to approve</span>
    <span class="stat"><b>${tickets.filter(t => t.status === 'sent').length}</b>sent</span>`;
}
function card(t) {
  const inFlight = laneOf(t) === 'flight';
  const idx = STEP_INDEX[t.status] ?? 0;
  const statusPill = t.status === 'error' ? '<span class="pill err">Error</span>'
    : t.status === 'sent' ? '<span class="pill ok">Sent</span>'
    : t.status === 'closed' ? '<span class="pill">Closed</span>'
    : t.status === 'claimed' ? `<span class="pill ok">${esc(t.assignee)}</span>` : '';
  return `
  <article class="tcard ${t.id === selected ? 'sel' : ''} ${DONE.includes(t.status) ? 'done' : ''}" data-id="${t.id}">
    <div class="top"><span>${t.id} · ${esc(t.inquiryType)}</span><span data-ago="${t.createdAt}">${ago(t.createdAt)}</span></div>
    <div class="who">${esc(t.name || t.email)}<small>${esc([t.role, t.company].filter(Boolean).join(' · ') || t.email)}</small></div>
    ${inFlight && t.status !== 'error' ? `
      <div class="steps">${STEPS.map((s, i) => `<i class="${i < idx ? 'on' : i === idx ? 'now' : ''}"></i>`).join('')}</div>
      <div class="stepname">${NOW_DOING[t.status] || 'Working…'}</div>` : ''}
    <div class="tags">${scorePill(t.score)}${cartPill(t)}${statusPill}</div>
    ${t.summary ? `<div class="snip">${esc(t.summary)}</div>` : `<div class="snip">${esc(t.message)}</div>`}
  </article>`;
}
document.addEventListener('click', e => {
  const c = e.target.closest('.tcard');
  if (c) openDetail(c.dataset.id);
});

// ---------- detail ----------
function openDetail(id) {
  if (selected !== id) draftDirty = false;
  selected = id; history.replaceState(null, '', '#' + id);
  lastSig = '';
  renderDetail();
  $('#detail').classList.add('open'); $('#scrim').classList.add('open');
  renderBoard();
}
function closeDetail() {
  selected = null; history.replaceState(null, '', location.pathname);
  $('#detail').classList.remove('open'); $('#scrim').classList.remove('open');
  renderBoard();
}
$('#scrim').onclick = closeDetail;
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

function renderDetail() {
  const t = tickets.find(x => x.id === selected);
  if (!t) return;
  const sig = JSON.stringify([t.status, t.route, t.timeline.length, t.notes.length, t.draft]);
  if (sig === lastSig) return;
  lastSig = sig;
  const keep = draftDirty ? { s: $('#d-subject')?.value, b: $('#d-body')?.value } : null;
  const e = t.enrichment, c = e?.company, person = e?.person;
  const lane = laneOf(t);

  $('#detail').innerHTML = `
    <header>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--muted);font-weight:600">${t.id} · ${esc(t.inquiryType)} · ${clock(t.createdAt)}</div>
        <h3 style="font-size:22px">${esc(t.name || t.email)}</h3>
        <div style="font-size:13px;color:var(--ink-2)">${esc([t.role, t.company].filter(Boolean).join(' · '))} · <a href="mailto:${esc(t.email)}">${esc(t.email)}</a></div>
      </div>
      <button class="x" onclick="closeDetail()" aria-label="Close">×</button>
    </header>
    <div class="content">
      ${t.status === 'error' ? `<div class="err-box"><b>Workflow didn't run.</b> ${esc(t.error || '')}<br>In n8n, either <b>Publish</b> the workflow, or open it and click <b>Execute workflow</b> so the test webhook is listening — then resubmit.</div>` : ''}

      ${t.draft ? `
        <h4><span class="ai-tag">AI DRAFT</span> &nbsp;Personalized outreach — review before sending</h4>
        <div class="box draft" style="display:grid;gap:10px">
          <input class="input" id="d-subject" value="${esc(keep?.s ?? t.draft.subject)}" ${t.status === 'sent' ? 'disabled' : ''}>
          <textarea class="input" id="d-body" ${t.status === 'sent' ? 'disabled' : ''}>${esc(keep?.b ?? t.draft.body)}</textarea>
          ${t.status === 'sent' ? '<span class="pill ok">Approved & sent</span>' : `
          <div class="actions">
            <button class="btn accent" id="sendBtn">Approve &amp; send</button>
            <button class="btn" id="saveBtn">Save edits</button>
          </div>`}
        </div>` : ''}

      <h4>AI research &amp; score</h4>
      ${t.score ? `
        <div class="box">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${scorePill(t.score)} <span class="ai-tag">AI</span> ${t.nextStep ? `<span style="font-size:13px;color:var(--ink-2)">Next: ${esc(t.nextStep)}</span>` : ''}</div>
          <p style="margin:10px 0 0">${esc(t.summary || '')}</p>
          ${t.reasons?.length ? `<ul class="reasons">${t.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
        </div>` : `<div class="box" style="color:var(--muted)">Waiting for the AI step…</div>`}

      <h4>Company lookup <span style="font-weight:400;text-transform:none;letter-spacing:0">(data the AI scored on)</span></h4>
      ${e ? `<div class="box"><dl class="facts">
        ${c ? `
          <dt>Company</dt><dd>${esc(c.name)}</dd>
          <dt>Industry</dt><dd>${esc(c.industry)}</dd>
          <dt>Size</dt><dd>${esc(c.employees)} employees · ${esc(c.hq)}</dd>
          <dt>Est. gear spend</dt><dd>${esc(c.estAnnualGearSpend)}</dd>
          <dt>Customer?</dt><dd>${c.existingCustomer ? `Yes · ${c.priorOrders} prior orders` : 'Not yet'}</dd>
          <dt>About</dt><dd>${esc(c.description)}</dd>` : `<dt>Result</dt><dd>${esc(e.note)}</dd>`}
        ${person ? `<dt>Contact</dt><dd>${esc(person.title)} · ${esc(person.seniority)}</dd><dt>Authority</dt><dd>${esc(person.buyingAuthority)}</dd>` : ''}
      </dl></div>` : `<div class="box" style="color:var(--muted)">Not looked up yet.</div>`}

      <h4>Cart check <span style="font-weight:400;text-transform:none;letter-spacing:0">(a real lookup, not an AI guess)</span></h4>
      ${t.cart ? (t.cart.items.length ? `<div class="box">
        ${t.cart.items.map(i => `<div class="line-item" style="grid-template-columns:40px 1fr auto">
          <div class="thumb" style="background:${i.color};width:40px;height:40px">${ICONS[i.icon]}</div>
          <div><div style="font-weight:600;font-size:14px">${esc(i.name)}</div><div class="meta">Size ${esc(i.size)} · Qty ${i.qty}</div></div>
          <div style="font-weight:600">${money(i.price * i.qty)}</div></div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:600;padding-top:10px"><span>Cart total</span><span>${money(t.cart.total)}</span></div>
      </div>` : `<div class="box">No items in cart.</div>`) : `<div class="box" style="color:var(--muted)">Not checked yet.</div>`}

      <h4>Original inquiry</h4>
      <div class="quote">${esc(t.message)}</div>

      <h4>Actions</h4>
      <div class="actions">
        ${lane === 'rep' && t.status !== 'claimed' && !DONE.includes(t.status) ? '<button class="btn primary" data-act="claim">Claim &amp; call</button>' : ''}
        ${!DONE.includes(t.status) ? `
          ${lane !== 'rep' ? '<button class="btn" data-act="reroute" data-route="rep">Move to rep queue</button>' : ''}
          ${lane !== 'nurture' ? '<button class="btn" data-act="reroute" data-route="nurture">Move to nurture</button>' : ''}
          <button class="btn ghost" data-act="close">Close ticket</button>` : ''}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="input" id="noteInput" placeholder="Add an internal note…">
        <button class="btn" id="noteBtn">Add</button>
      </div>
      ${t.notes.length ? `<ul class="timeline" style="margin-top:10px">${t.notes.map(n => `<li><time>${clock(n.at).slice(0, 5)}</time><span>${esc(n.text)}</span></li>`).join('')}</ul>` : ''}

      <h4>Timeline</h4>
      <ul class="timeline">${t.timeline.map(x => `<li><time>${clock(x.at)}</time><span>${esc(x.label)}</span></li>`).join('')}</ul>
    </div>`;

  const body = $('#d-body'), subj = $('#d-subject');
  if (body) [body, subj].forEach(el => el.addEventListener('input', () => (draftDirty = true)));
  const sendBtn = $('#sendBtn');
  if (sendBtn) sendBtn.onclick = async () => {
    draftDirty = false;
    await act('send', { subject: subj.value, body: body.value });
    toast(`Outreach sent to ${esc(t.email)}`);
  };
  const saveBtn = $('#saveBtn');
  if (saveBtn) saveBtn.onclick = async () => { draftDirty = false; await act('draft', { subject: subj.value, body: body.value }); toast('Draft saved'); };
  $('#noteBtn').onclick = async () => { const v = $('#noteInput').value.trim(); if (v) await act('note', { text: v }); };
  $('#detail').querySelectorAll('[data-act]').forEach(b => b.onclick = () => act(b.dataset.act, { route: b.dataset.route, name: 'You', reason: 'Closed by rep' }));
}
async function act(action, body) {
  try { await api(`/api/tickets/${selected}/${action}`, body || {}); }
  catch (err) { toast('Error: ' + esc(err.message)); }
}

// ---------- live stream ----------
function connect() {
  const es = new EventSource('/api/events');
  es.onopen = () => $('#live').classList.remove('off');
  es.onmessage = ev => {
    const prev = new Set(tickets.map(t => t.id + t.route));
    tickets = JSON.parse(ev.data).tickets;
    renderBoard();
    if (selected) renderDetail();
    for (const t of tickets) if (t.route && !prev.has(t.id + t.route) && prev.size) {
      toast(`<b>${t.id}</b> routed → ${{ approval: 'Needs approval', rep: 'Rep queue', nurture: 'Nurture' }[t.route]}`);
    }
  };
  es.onerror = () => $('#live').classList.add('off');
}
setInterval(() => document.querySelectorAll('[data-ago]').forEach(el => (el.textContent = ago(el.dataset.ago))), 5000);

$('#reset').onclick = async () => {
  if (!confirm('Clear all tickets and restore the demo carts?')) return;
  await api('/api/reset', {});
  closeDetail();
  toast('Demo reset');
};

connect();
if (selected) setTimeout(() => tickets.some(t => t.id === selected) ? openDetail(selected) : (selected = null), 400);
