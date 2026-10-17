const $ = s => document.querySelector(s);
const GUEST = { email: '', name: 'Guest', demo: 'Enter any email in the form' };
let products = [], personas = [], me = GUEST;

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
}
function toast(msg) {
  const t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 3800);
}

// ---------- persona ----------
function renderPersonaPicker() {
  const saved = localStorageGet('nf-persona');
  $('#persona').innerHTML = personas.map(p => `<option value="${esc(p.email)}">${esc(p.name)}${p.company ? ' · ' + esc(p.company) : ''}</option>`).join('') + '<option value="">Guest (type your own)</option>';
  $('#persona').value = saved ?? personas[0].email;
  setPersona($('#persona').value);
}
function setPersona(email) {
  me = personas.find(p => p.email === email) || GUEST;
  localStorageSet('nf-persona', email);
  $('#personaHint').textContent = me.demo ? 'Demo path: ' + me.demo : '';
  $('#personaFill').innerHTML = me.email
    ? `Signed in as <b>${esc(me.name)}</b>${me.role ? ', ' + esc(me.role) : ''}. <br><button type="button" class="btn sm" style="margin-top:8px" id="fillBtn">Fill in ${esc(me.name.split(' ')[0])}'s inquiry</button>`
    : 'Browsing as a guest — type any name and email into the form.';
  const fb = $('#fillBtn'); if (fb) fb.onclick = fillForm;
  $('#f-name').value = me.email ? me.name : '';
  $('#f-email').value = me.email;
  $('#f-company').value = me.company || '';
  $('#f-role').value = me.role || '';
  $('#f-message').value = '';
  refreshCart();
}
function fillForm() {
  $('#f-type').value = me.inquiryType;
  $('#f-message').value = me.message;
  $('#f-message').focus();
}
function currentEmail() { return me.email || $('#f-email').value.trim().toLowerCase(); }

// ---------- products ----------
function renderProducts() {
  $('#products').innerHTML = products.map(p => `
    <article class="card">
      <div class="art" style="background:${p.color}">${ICONS[p.icon]}</div>
      <div class="body">
        <div class="cat">${esc(p.category)}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="blurb">${esc(p.blurb)}</div>
        <div class="row">
          <span class="price">${money(p.price)}</span>
          <select aria-label="Size" data-size="${p.id}">${p.sizes.map(s => `<option>${esc(s)}</option>`).join('')}</select>
          <button class="btn primary sm" data-add="${p.id}">Add</button>
        </div>
      </div>
    </article>`).join('');
}
document.addEventListener('click', async e => {
  const id = e.target.dataset.add;
  if (!id) return;
  const email = currentEmail();
  if (!email) { toast('Pick a persona or enter an email in the form first.'); $('#f-email').focus(); return; }
  const size = document.querySelector(`[data-size="${id}"]`).value;
  const cart = await api('/api/cart', { email, id, size, qty: 1 });
  renderCart(cart);
  toast(`Added to cart · ${esc(products.find(p => p.id === id).name)} (${esc(size)})`);
});

// ---------- cart ----------
async function refreshCart() {
  const email = currentEmail();
  renderCart(email ? await api('/api/cart?email=' + encodeURIComponent(email)) : { items: [], total: 0 });
}
function renderCart(cart) {
  $('#cartCount').textContent = cart.items.reduce((s, i) => s + i.qty, 0);
  $('#cartTotal').textContent = money(cart.total);
  $('#cartLines').innerHTML = cart.items.length ? cart.items.map(i => `
    <div class="line-item">
      <div class="thumb" style="background:${i.color}">${ICONS[i.icon]}</div>
      <div><div style="font-weight:600">${esc(i.name)}</div><div class="meta">Size ${esc(i.size)} · Qty ${i.qty}</div></div>
      <div style="font-weight:600">${money(i.price * i.qty)}</div>
    </div>`).join('') : '<p style="color:var(--muted)">Your cart is empty.</p>';
}
function openCart(open) { $('#cart').classList.toggle('open', open); $('#scrim').classList.toggle('open', open); }
$('#openCart').onclick = () => openCart(true);
$('#closeCart').onclick = $('#scrim').onclick = () => openCart(false);
$('#checkout').onclick = () => toast('Checkout is disabled in this demo — the cart stays open so the workflow can find it.');
$('#clearCart').onclick = async () => { const email = currentEmail(); if (email) renderCart(await api('/api/cart/clear', { email })); };

// ---------- inquiry ----------
$('#inquiryForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#submitBtn'); btn.disabled = true; $('#formStatus').textContent = 'Sending…';
  try {
    const { id } = await api('/api/inquiry', {
      name: $('#f-name').value.trim(), email: $('#f-email').value.trim(), company: $('#f-company').value.trim(),
      role: $('#f-role').value.trim(), inquiryType: $('#f-type').value, message: $('#f-message').value.trim(),
    });
    $('#formStatus').innerHTML = `Thanks! Ticket <b>${id}</b> created. <a href="/rep#${id}" target="_blank">Watch it in the rep console ↗</a>`;
    $('#f-message').value = '';
  } catch (err) {
    $('#formStatus').textContent = 'Something went wrong: ' + err.message;
  } finally { btn.disabled = false; }
};
$('#f-email').addEventListener('change', () => { if (!me.email) refreshCart(); });
$('#persona').onchange = e => setPersona(e.target.value);

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

(async () => {
  [products, personas] = await Promise.all([api('/api/products'), api('/api/personas')]);
  renderProducts();
  renderPersonaPicker();
})();
