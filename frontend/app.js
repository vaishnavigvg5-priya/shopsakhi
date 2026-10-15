const $ = s => document.querySelector(s); let T = localStorage.t || '', NAME = localStorage.n || '', ORD = [], PS = [], MODE = 'login', RT = '';
const rs = n => '₹' + (n || 0).toLocaleString('en-IN');
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + T }, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d;
}
const toast = (m, bad) => { const t = $('#toast'); t.className = bad ? 'bad show' : 'show'; t.textContent = m; setTimeout(() => t.className = '', 2800); };
const modal = h => { $('#modal').innerHTML = `<div class="mbox"><button class="x" onclick="closeM()">✕</button>${h}</div>`; $('#modal').hidden = false; };
const closeM = () => $('#modal').hidden = true;
const run = async (f, ok) => { try { await f(); ok && toast(ok); route(); } catch (e) { toast(e.message, 1); } };
const logout = () => { localStorage.clear(); location.hash = ''; location.reload(); };

/* ---------- Auth ---------- */
function showAuth() {
  const L = MODE == 'login';
  $('#root').innerHTML = `<div class="auth"><div class="hero"><h1>🛍️ ShopSakhi</h1><h2>Your chat-to-cash business autopilot</h2><ul>
  <li>💬 Turn Instagram & WhatsApp chats into orders</li><li>✅ Verify payments and catch fake UTRs</li><li>💔 Recover lost sales automatically</li><li>📊 See your real profit</li></ul></div>
  <div class="form card"><h2>${L ? 'Welcome back' : 'Create your shop'}</h2>${L ? '' : '<input id="nm" placeholder="Your name">'}<input id="em" placeholder="Email"><input id="pw" type="password" placeholder="Password">
  <button class="btn" onclick="auth()">${L ? 'Sign in' : 'Get started'}</button><p class="muted">${L ? 'New here?' : 'Already registered?'} <a onclick="MODE='${L ? 'reg' : 'login'}';showAuth()">${L ? 'Create account' : 'Sign in'}</a></p><p id="err" class="err"></p></div></div>`;
}
async function auth() {
  try { const d = await api('/auth/' + (MODE == 'login' ? 'login' : 'register'), 'POST', { name: $('#nm')?.value, email: $('#em').value, password: $('#pw').value });
    T = d.token; NAME = d.name; localStorage.t = T; localStorage.n = NAME; location.hash = '#/dashboard'; $('#root').innerHTML = ''; route(); } catch (e) { $('#err').textContent = e.message; }
}

/* ---------- Shell + router ---------- */
const NAV = [['dashboard', '🏠', 'Dashboard'], ['inbox', '💬', 'Inbox'], ['orders', '📦', 'Orders'], ['payments', '💳', 'Payments'], ['stock', '🧵', 'Stock'], ['customers', '👥', 'Customers'], ['insights', '📊', 'Insights'], ['settings', '⚙️', 'Settings']];
function shell() {
  if ($('#page')) return;
  $('#root').innerHTML = `<aside><div class="logo">🛍️ ShopSakhi</div>${NAV.map(n => `<a id="n-${n[0]}" href="#/${n[0]}"><span>${n[1]}</span>${n[2]}</a>`).join('')}<div class="me">👩 ${esc(NAME)}</div></aside>
  <section><div class="top"><span>Business Autopilot</span><span id="ai" class="pill">AI checking…</span></div><div id="page" class="page"></div></section>`;
  api('/ai/status').then(a => $('#ai').textContent = a.online ? '🟢 AI online · ' + a.model : '🟠 AI offline · basic mode').catch(() => { });
}
async function route() {
  if (!T) return showAuth(); shell();
  const p = location.hash.slice(2) || 'dashboard';
  document.querySelectorAll('aside a').forEach(a => a.classList.toggle('on', a.id == 'n-' + p));
  try { $('#page').innerHTML = `<div class="fade">${await PAGES[p]()}</div>`; } catch (e) { /sign in/i.test(e.message) ? logout() : toast(e.message, 1); }
}

/* ---------- Helpers ---------- */
const chart = d => { const mx = Math.max(1, ...d.map(x => x.v)); return `<div class="bars">${d.map(x => `<div><em>${x.v ? rs(x.v) : ''}</em><i style="height:${x.v / mx * 100}%"></i><small>${x.day}</small></div>`).join('')}</div>`; };
const items = o => o.items.map(i => i.qty + '× ' + esc(i.name)).join(', ');
async function replyModal(id) {
  const o = (await api('/orders')).find(x => x._id == id); RT = o.rawChat || '';
  modal(`<h3>Smart reply for ${esc(o.customer)}</h3><p class="muted">"${esc(RT)}"</p><select id="lg"><option>English</option><option>Tamil</option><option>Tanglish</option></select>
  <button class="btn" onclick="genReply()">✨ Generate reply</button><textarea id="rp" rows="4"></textarea><button class="btn alt" onclick="navigator.clipboard.writeText($('#rp').value);toast('Copied')">Copy</button>`); genReply();
}
async function genReply() { $('#rp').value = 'Writing…'; try { $('#rp').value = (await api('/ai/reply', 'POST', { text: RT, lang: $('#lg').value })).reply; } catch (e) { toast(e.message, 1); } }
const utrModal = id => modal(`<h3>Verify payment</h3><p class="muted">Enter the UTR from your bank SMS or UPI app.</p><input id="ut" placeholder="UTR number"><button class="btn" onclick="submitUtr('${id}')">Verify</button>`);
const submitUtr = id => run(async () => { const o = await api('/orders/' + id + '/pay', 'POST', { utr: $('#ut').value }); closeM(); toast(o.fraud ? '⚠️ Duplicate UTR - possible fake payment' : 'Payment verified ✅', o.fraud); });
const slip = id => { const o = ORD.find(x => x._id == id); modal(`<div class="slip"><h2>🛍️ ShopSakhi · Packing Slip</h2><p><b>Order:</b> #${id.slice(-6).toUpperCase()}<br><b>Customer:</b> ${esc(o.customer)}</p>
  <table>${o.items.map(i => `<tr><td>${esc(i.name)}</td><td>× ${i.qty}</td><td>${rs(i.qty * i.price)}</td></tr>`).join('')}<tr><th>Total</th><th></th><th>${rs(o.total)}</th></tr></table><p>Thank you for shopping with us 💜</p></div><button class="btn" onclick="print()">🖨️ Print</button>`); };

/* ---------- Pages ---------- */
async function dashboard() {
  const d = await api('/insights'), h = new Date().getHours();
  return `<h1>${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${esc(NAME)} 👋</h1>
  <div class="stats"><div class="stat g1"><small>Revenue</small><b>${rs(d.revenue)}</b></div><div class="stat g2"><small>Net profit</small><b>${rs(d.profit)}</b></div><div class="stat g3"><small>New orders</small><b>${d.newOrders}</b></div><div class="stat g4"><small>Lost sales</small><b>${d.lost.length}</b></div></div>
  <div class="row"><div class="card"><h3>Revenue · last 7 days</h3>${chart(d.daily)}</div><div class="card"><h3>Quick actions</h3><a class="btn" href="#/inbox">💬 Add chat</a><a class="btn alt" href="#/orders">📦 Orders</a><a class="btn alt2" href="#/stock">🧵 Stock</a><a class="btn alt" href="#/insights">📊 Insights</a></div></div>
  <div class="row"><div class="card"><h3>💔 Lost-sale recovery</h3>${d.lost.map(o => `<div class="li"><span>${esc(o.customer)}: ${esc((o.rawChat || '').slice(0, 50))}</span><button class="btn sm" onclick="replyModal('${o._id}')">Draft reply</button></div>`).join('') || '<p class="muted">No pending enquiries 🎉</p>'}</div>
  <div class="card"><h3>🚨 Alerts</h3>${d.fraud.map(o => `<div class="li">⚠️ ${esc(o.customer)} · duplicate UTR ${esc(o.utr)}</div>`).join('')}${d.lowStock.map(p => `<div class="li">📉 ${esc(p.name)} · only ${p.stock} left</div>`).join('')}${!d.fraud.length && !d.lowStock.length ? '<p class="muted">All clear ✅</p>' : ''}</div></div>`;
}
const orderRow = o => `<div class="li"><span><b>${esc(o.customer)}</b> <span class="tag ${o.status}">${o.status}</span><br><small class="muted">${items(o) || esc((o.rawChat || '').slice(0, 60))}</small></span>
  <span>${rs(o.total)} ${o.status == 'Draft' ? `<button class="btn sm" onclick="run(()=>api('/orders/${o._id}/confirm','POST'),'Order confirmed')">Confirm</button>` : `<button class="btn sm alt" onclick="replyModal('${o._id}')">Draft reply</button>`}</span></div>`;
async function inbox() {
  const os = (await api('/orders')).filter(o => ['Draft', 'Enquiry'].includes(o.status));
  return `<h1>Inbox</h1><div class="card"><h3>Paste a customer chat</h3><textarea id="chat" rows="5" placeholder="e.g. Hi, I need 2 scrunchies. I'll pay by GPay."></textarea><button class="btn" onclick="parse()">🤖 Analyze with AI</button>
  <p class="muted">Works with English, Tamil and mixed-language chats. Phone numbers are masked before the AI sees them.</p></div><div class="card"><h3>Waiting for action</h3>${os.map(orderRow).join('') || '<p class="muted">Nothing waiting.</p>'}</div>`;
}
function parse() {
  const c = $('#chat').value.trim(); if (!c) return toast('Paste a chat first', 1); toast('AI is reading the chat…');
  run(async () => { const r = await api('/ai/parse', 'POST', { chat: c }); toast(r.order.status == 'Draft' ? 'Draft order created' : 'Saved as enquiry'); });
}
const FLOW = ['New', 'Paid', 'Packed', 'Shipped', 'Delivered'], NEXT = { Paid: 'Packed', Packed: 'Shipped', Shipped: 'Delivered' };
const mv = (id, s) => `run(()=>api('/orders/${id}/status','POST',{status:'${s}'}),'Moved to ${s}')`;
async function orders() {
  ORD = await api('/orders');
  return `<h1>Orders board</h1><div class="board">${FLOW.map(s => `<div class="col c-${s}"><h4>${s} <em>${ORD.filter(o => o.status == s).length}</em></h4>${ORD.filter(o => o.status == s).map(o => `<div class="card oc"><b>${esc(o.customer)}</b><span>${rs(o.total)}</span><small>${items(o)}</small>
  <div>${o.verified ? '<span class="tag Paid">Verified</span>' : ''}${o.fraud ? '<span class="tag Cancelled">Duplicate UTR</span>' : ''}</div><div>
  ${s == 'New' ? `<button class="btn sm" onclick="utrModal('${o._id}')">Verify payment</button>` : ''}${NEXT[s] ? `<button class="btn sm" onclick="${mv(o._id, NEXT[s])}">Mark ${NEXT[s]}</button>` : ''}
  <button class="btn sm alt" onclick="slip('${o._id}')">🧾 Slip</button>${s != 'Delivered' ? `<button class="btn sm danger" onclick="${mv(o._id, 'Cancelled')}">Cancel</button>` : ''}</div></div>`).join('')}</div>`).join('')}</div>`;
}
async function payments() {
  const os = (await api('/orders')).filter(o => !['Enquiry', 'Draft'].includes(o.status));
  return `<h1>Payments</h1><div class="card"><table><tr><th>Customer</th><th>Amount</th><th>UTR</th><th>Status</th><th></th></tr>${os.map(o => `<tr><td>${esc(o.customer)}</td><td>${rs(o.total)}</td><td>${esc(o.utr || '–')}</td>
  <td>${o.fraud ? '<span class="tag Cancelled">Duplicate UTR</span>' : o.verified ? '<span class="tag Paid">Verified</span>' : '<span class="tag New">Pending</span>'}</td><td>${!o.verified && o.status == 'New' ? `<button class="btn sm" onclick="utrModal('${o._id}')">Verify</button>` : ''}</td></tr>`).join('')}</table></div>`;
}
async function stock() {
  PS = await api('/products');
  return `<h1>Products & Stock</h1><div class="card"><h3>Add product</h3><div class="form4"><input id="pn" placeholder="Product name"><input id="pp" type="number" placeholder="Selling price ₹"><input id="pc" type="number" placeholder="Cost price ₹"><input id="ps" type="number" placeholder="Stock"></div>
  <button class="btn" onclick="addP()">＋ Add product</button></div><div class="cards">${PS.map(p => `<div class="card"><b>${esc(p.name)}</b> ${p.stock <= p.low ? '<span class="tag Cancelled">Low stock</span>' : ''}<div class="big">${p.stock}</div>
  <small class="muted">Price ${rs(p.price)} · Cost ${rs(p.cost)} · Margin ${rs(p.price - p.cost)}</small><div><button class="btn sm" onclick="run(()=>api('/products/${p._id}','PUT',{stock:${p.stock + 10}}),'Restocked +10')">+10</button>
  <button class="btn sm alt" onclick="editP('${p._id}')">Edit</button><button class="btn sm danger" onclick="run(()=>api('/products/${p._id}','DELETE'),'Deleted')">Delete</button></div></div>`).join('')}</div>`;
}
const addP = () => run(() => api('/products', 'POST', { name: $('#pn').value, price: +$('#pp').value, cost: +$('#pc').value, stock: +$('#ps').value }), 'Product added');
function editP(id) {
  const p = PS.find(x => x._id == id);
  modal(`<h3>Edit ${esc(p.name)}</h3><input id="en" value="${esc(p.name)}"><input id="ep" type="number" value="${p.price}"><input id="ec" type="number" value="${p.cost}"><input id="es" type="number" value="${p.stock}">
  <button class="btn" onclick="run(()=>api('/products/${id}','PUT',{name:$('#en').value,price:+$('#ep').value,cost:+$('#ec').value,stock:+$('#es').value}).then(closeM),'Saved')">Save</button>`);
}
async function customers() {
  const cs = await api('/customers');
  return `<h1>Customers</h1><div class="card"><table><tr><th>Name</th><th>Orders</th><th>Spent</th><th>Risk score</th></tr>${cs.map(c => `<tr><td>${esc(c.name)}</td><td>${c.orders}</td><td>${rs(c.spent)}</td>
  <td><div class="meter"><i class="${c.level}" style="width:${Math.max(c.risk, 8)}%"></i></div><span class="tag ${c.level}">${c.level} · ${c.risk}</span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No customers yet</td></tr>'}</table></div>`;
}
async function insights() {
  const [d, ex] = await Promise.all([api('/insights'), api('/expenses')]), mx = Math.max(1, ...d.best.map(b => b[1]));
  return `<h1>Insights</h1><div class="stats"><div class="stat g1"><small>Revenue</small><b>${rs(d.revenue)}</b></div><div class="stat g5"><small>Product cost</small><b>${rs(d.cogs)}</b></div>
  <div class="stat g3"><small>Packaging + expenses</small><b>${rs(d.packaging + d.expenses)}</b></div><div class="stat g2"><small>Net profit</small><b>${rs(d.profit)}</b></div></div>
  <div class="row"><div class="card"><h3>Revenue · last 7 days</h3>${chart(d.daily)}</div><div class="card"><h3>🏆 Best sellers</h3>${d.best.map(b => `<div class="hb"><span>${esc(b[0])}</span><i style="width:${b[1] / mx * 100}%"></i><b>${b[1]}</b></div>`).join('') || '<p class="muted">No sales yet</p>'}
  <h3>Order funnel</h3>${Object.entries(d.funnel).map(([k, v]) => `<span class="tag ${k}">${k}: ${v}</span>`).join('')}</div></div>
  <div class="card"><h3>🧮 Expenses (ads, courier…)</h3><div class="form3"><select id="et"><option>Ad spend</option><option>Courier</option><option>Packaging</option><option>Other</option></select><input id="ea" type="number" placeholder="Amount ₹">
  <button class="btn" onclick="run(()=>api('/expenses','POST',{type:$('#et').value,amount:+$('#ea').value}),'Expense added')">Add</button></div>
  ${ex.map(e => `<div class="li"><span>${esc(e.type)}</span><span>${rs(e.amount)} <button class="btn sm danger" onclick="run(()=>api('/expenses/${e._id}','DELETE'))">✕</button></span></div>`).join('')}</div>`;
}
async function settings() {
  const s = await api('/settings');
  return `<h1>Settings</h1><div class="row"><div class="card"><h3>Business rules</h3><label>Packaging cost per order (₹)</label><input id="sp" type="number" value="${s.packaging ?? 10}">
  <label>Mark an enquiry as lost after (minutes)</label><input id="sl" type="number" value="${s.lostMins ?? 60}"><button class="btn" onclick="run(()=>api('/settings','PUT',{packaging:+$('#sp').value,lostMins:+$('#sl').value}),'Settings saved')">Save</button></div>
  <div class="card"><h3>Demo & account</h3><p class="muted">Load sample products, orders and expenses to try every feature.</p><button class="btn alt" onclick="run(()=>api('/demo','POST'),'Demo data loaded')">Load demo data</button><button class="btn danger" onclick="logout()">Sign out</button></div></div>
  <div class="card"><h3>🔒 Privacy</h3><p class="muted">Your data stays on your computer. AI runs locally with Ollama. Phone numbers are masked, and messages containing OTP or password words are never sent to AI.</p></div>`;
}
const PAGES = { dashboard, inbox, orders, payments, stock, customers, insights, settings };
onhashchange = route; route();
