// Northfield Outfitters demo server — storefront, rep console, and the API n8n calls into.
// Zero dependencies: `node server.js`
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
// Where the store sends new inquiries (n8n production webhook).
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/northfield-inquiry';
// How n8n (running in Docker) reaches this server.
const CALLBACK_BASE = process.env.CALLBACK_BASE || 'http://host.docker.internal:' + PORT;

const ROOT = __dirname;
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seed.json'), 'utf8'));
const STATE_FILE = path.join(ROOT, 'data', 'state.json');

let state = loadState();

function freshState() {
  return {
    nextTicket: 1042,
    carts: JSON.parse(JSON.stringify(SEED.carts)),
    tickets: [],
  };
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return freshState(); }
}
function save() {
  fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), () => {});
  broadcast();
}

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
function broadcast() {
  const msg = 'data: ' + JSON.stringify({ tickets: state.tickets }) + '\n\n';
  for (const res of clients) res.write(msg);
}

// ---------- helpers ----------
const productById = Object.fromEntries(SEED.products.map(p => [p.id, p]));
const now = () => new Date().toISOString();

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
function cartFor(email) {
  const items = (state.carts[(email || '').toLowerCase()] || [])
    .map(i => ({ ...productById[i.id], size: i.size, qty: i.qty }))
    .filter(i => i.id);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  return { items, total: Math.round(total * 100) / 100 };
}
function ticket(id) { return state.tickets.find(t => t.id === id); }
function stage(t, status, label) {
  if (!t) return;
  t.status = status;
  t.timeline.push({ at: now(), label });
  save();
}
function enrich(email) {
  const e = (email || '').toLowerCase();
  const domain = e.split('@')[1] || '';
  const person = SEED.people[e];
  const company = SEED.companies[domain];
  if (SEED.freeEmailDomains.includes(domain)) {
    return { found: false, domain, emailType: 'personal', note: 'Personal email address — no company record.' , person: person || null };
  }
  if (!company) return { found: false, domain, emailType: 'business', note: 'Company not found in directory.', person: person || null };
  return { found: true, domain, emailType: 'business', company, person: person || null };
}

// ---------- static files ----------
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/rep') pathname = '/rep.html';
  const file = path.join(ROOT, 'public', path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST' });
    return res.end();
  }
  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  // Catalog & personas
  if (p === '/api/products') return send(res, 200, SEED.products);
  if (p === '/api/personas') return send(res, 200, SEED.personas);
  if (p === '/api/config') return send(res, 200, { n8nWebhook: N8N_WEBHOOK_URL, callbackBase: CALLBACK_BASE });

  // Live ticket stream
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: ' + JSON.stringify({ tickets: state.tickets }) + '\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // Cart (storefront)
  if (p === '/api/cart' && req.method === 'GET') return send(res, 200, cartFor(q.email));
  if (p === '/api/cart' && req.method === 'POST') {
    const { email, id, size, qty } = await readBody(req);
    const key = (email || '').toLowerCase();
    if (!key || !productById[id]) return send(res, 400, { error: 'email and valid product id required' });
    const cart = (state.carts[key] = state.carts[key] || []);
    const line = cart.find(i => i.id === id && i.size === size);
    if (line) line.qty += qty ?? 1; else cart.push({ id, size: size || 'One size', qty: qty ?? 1 });
    state.carts[key] = cart.filter(i => i.qty > 0);
    save();
    return send(res, 200, cartFor(key));
  }
  if (p === '/api/cart/clear' && req.method === 'POST') {
    const { email } = await readBody(req);
    delete state.carts[(email || '').toLowerCase()];
    save();
    return send(res, 200, cartFor(email));
  }

  // Inquiry form → ticket → n8n
  if (p === '/api/inquiry' && req.method === 'POST') {
    const b = await readBody(req);
    if (!b.email || !b.message) return send(res, 400, { error: 'email and message required' });
    const t = {
      id: 'NF-' + state.nextTicket++,
      createdAt: now(),
      name: b.name || '', email: b.email.toLowerCase(), company: b.company || '', role: b.role || '',
      inquiryType: b.inquiryType || 'General question', message: b.message,
      status: 'received', route: null, score: null, summary: null, reasons: [], cart: null, draft: null,
      enrichment: null, notes: [], timeline: [{ at: now(), label: 'Inquiry received from storefront' }],
    };
    state.tickets.unshift(t);
    save();
    const payload = { ticketId: t.id, name: t.name, email: t.email, company: t.company, role: t.role,
      inquiryType: t.inquiryType, message: t.message, submittedAt: t.createdAt, callbackBase: CALLBACK_BASE };
    const post = url => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    post(N8N_WEBHOOK_URL)
      .then(async r => {
        let via = 'published workflow';
        // Not published? Try the editor's test webhook, so nodes light up live on the canvas
        // (click "Execute workflow" in n8n first).
        if (r.status === 404) { r = await post(N8N_WEBHOOK_URL.replace('/webhook/', '/webhook-test/')); via = 'test webhook (editor)'; }
        if (!r.ok) throw new Error('n8n responded ' + r.status + ': ' + (await r.text()).slice(0, 200));
        // n8n may already have called back by now; don't move the ticket backwards.
        if (t.status === 'received') stage(t, 'sent_to_n8n', 'Handed to n8n · ' + via);
      })
      .catch(err => { t.error = String(err.message || err); stage(t, 'error', 'Could not reach n8n — ' + t.error); });
    return send(res, 201, { id: t.id });
  }

  // ---- Endpoints n8n calls ----
  // 1) Research: company/person lookup (the "facts" the AI scores on)
  if (p === '/api/enrich') {
    const data = enrich(q.email);
    const t = ticket(q.ticketId);
    if (t) { t.enrichment = data; stage(t, 'researching', 'n8n · Looked up company & role'); }
    return send(res, 200, data);
  }
  // 2) Cart check — a real lookup, not an AI guess
  if (p === '/api/cart/lookup') {
    const c = cartFor(q.email);
    const t = ticket(q.ticketId);
    if (t) { t.cart = c; stage(t, 'cart_check', c.items.length ? `n8n · Cart check: ${c.items.length} item(s), $${c.total}` : 'n8n · Cart check: empty'); }
    return send(res, 200, { email: q.email, hasCart: c.items.length > 0, itemCount: c.items.reduce((s, i) => s + i.qty, 0), ...c });
  }
  // 3) Final routing decision
  if (p === '/api/leads/route' && req.method === 'POST') {
    const b = await readBody(req);
    const t = ticket(b.ticketId);
    if (!t) return send(res, 404, { error: 'unknown ticket' });
    t.route = b.route;
    if (b.score) t.score = b.score;
    if (b.summary) t.summary = b.summary;
    if (b.reasons) t.reasons = b.reasons;
    if (b.draft) t.draft = { subject: b.draft.subject || '', body: b.draft.body || '' };
    if (b.nextStep) t.nextStep = b.nextStep;
    const label = { approval: 'Routed → AI drafted outreach, awaiting rep approval', rep: 'Routed → Rep queue (call today)', nurture: 'Routed → Nurture sequence' }[b.route] || 'Routed';
    stage(t, 'routed', 'n8n · ' + label);
    return send(res, 200, { ok: true });
  }

  // ---- Rep console actions ----
  if (p === '/api/tickets') return send(res, 200, state.tickets);
  const m = p.match(/^\/api\/tickets\/([\w-]+)\/(\w+)$/);
  if (m && req.method === 'POST') {
    const t = ticket(m[1]);
    if (!t) return send(res, 404, { error: 'unknown ticket' });
    const b = await readBody(req);
    const action = m[2];
    if (action === 'draft') { t.draft = { subject: b.subject, body: b.body }; t.timeline.push({ at: now(), label: 'Rep edited draft' }); save(); }
    else if (action === 'send') { if (b.subject) t.draft = { subject: b.subject, body: b.body }; stage(t, 'sent', 'Rep approved & sent outreach email'); }
    else if (action === 'claim') { t.assignee = b.name || 'You'; stage(t, 'claimed', `Claimed by ${t.assignee}`); }
    else if (action === 'close') { stage(t, 'closed', b.reason || 'Closed'); }
    else if (action === 'reroute') { t.route = b.route; stage(t, 'routed', 'Manually moved → ' + b.route); }
    else if (action === 'note') { t.notes.push({ at: now(), text: b.text }); save(); }
    else return send(res, 400, { error: 'unknown action' });
    return send(res, 200, t);
  }

  if (p === '/api/reset' && req.method === 'POST') {
    state = freshState();
    save();
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`\n  Northfield Outfitters demo`);
  console.log(`  Storefront   http://localhost:${PORT}/`);
  console.log(`  Rep console  http://localhost:${PORT}/rep`);
  console.log(`  → n8n webhook ${N8N_WEBHOOK_URL}`);
  console.log(`  ← n8n calls back on ${CALLBACK_BASE}\n`);
});
