const r = require('express').Router(), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { User, Product, Order, Expense } = require('./models'), { parseChat, draftReply } = require('./ai');
const wrap = f => (q, s) => f(q, s).catch(e => s.status(400).json({ error: e.message }));
const auth = (q, s, n) => { try { q.uid = jwt.verify((q.headers.authorization || '').slice(7), process.env.JWT_SECRET).id; n(); } catch { s.status(401).json({ error: 'Please sign in' }); } };
const tok = u => ({ token: jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '12h' }), name: u.name });

r.post('/auth/register', wrap(async (q, s) => {
  const { name, email, password } = q.body;
  if (!name || !email || password?.length < 6) throw new Error('Name, email and a 6+ character password are required');
  s.json(tok(await User.create({ name, email, pass: await bcrypt.hash(password, 10) })));
}));
r.post('/auth/login', wrap(async (q, s) => {
  const u = await User.findOne({ email: q.body.email });
  if (!u || !(await bcrypt.compare(q.body.password || '', u.pass))) throw new Error('Invalid email or password');
  s.json(tok(u));
}));

r.use(auth);
r.get('/products', wrap(async (q, s) => s.json(await Product.find({ owner: q.uid }))));
r.post('/products', wrap(async (q, s) => s.json(await Product.create({ ...q.body, owner: q.uid }))));
r.put('/products/:id', wrap(async (q, s) => s.json(await Product.findOneAndUpdate({ _id: q.params.id, owner: q.uid }, q.body, { new: true }))));
r.delete('/products/:id', wrap(async (q, s) => { await Product.deleteOne({ _id: q.params.id, owner: q.uid }); s.json({ ok: 1 }); }));

// Chat paste -> AI -> Draft order / Enquiry
r.post('/ai/parse', wrap(async (q, s) => {
  const products = await Product.find({ owner: q.uid });
  const p = await parseChat(q.body.chat || '', products);
  const items = (p.items || []).map(i => {
    const pr = products.find(x => x.name.toLowerCase() === String(i.name).toLowerCase()) || products.find(x => String(i.name).toLowerCase().includes(x.name.toLowerCase()));
    return pr ? { name: pr.name, qty: +i.qty || 1, price: pr.price, cost: pr.cost } : null;
  }).filter(Boolean);
  const o = await Order.create({ owner: q.uid, customer: p.customer || 'Unknown', rawChat: q.body.chat, items,
    total: items.reduce((a, i) => a + i.qty * i.price, 0), status: p.type === 'order' && items.length ? 'Draft' : 'Enquiry' });
  s.json({ order: o, ai: p.ai });
}));

r.get('/orders', wrap(async (q, s) => s.json(await Order.find({ owner: q.uid }).sort('-createdAt'))));
r.post('/orders/:id/confirm', wrap(async (q, s) => { // Draft confirm = stock reduce
  const o = await Order.findOne({ _id: q.params.id, owner: q.uid });
  if (o.status !== 'Draft' && o.status !== 'Enquiry') throw new Error('Already confirmed');
  for (const i of o.items) await Product.updateOne({ owner: q.uid, name: i.name }, { $inc: { stock: -i.qty } });
  o.status = 'New'; await o.save(); s.json(o);
}));
r.post('/orders/:id/status', wrap(async (q, s) => {
  const o = await Order.findOne({ _id: q.params.id, owner: q.uid }), st = q.body.status;
  if (st === 'Cancelled' && ['New', 'Paid', 'Packed', 'Shipped'].includes(o.status)) for (const i of o.items) await Product.updateOne({ owner: q.uid, name: i.name }, { $inc: { stock: i.qty } });
  o.status = st; await o.save(); s.json(o);
}));
r.post('/orders/:id/pay', wrap(async (q, s) => { // UTR duplicate = fake alert
  const utr = (q.body.utr || '').trim();
  if (utr.length < 6) throw new Error('Enter a valid UTR');
  const o = await Order.findOne({ _id: q.params.id, owner: q.uid });
  const dup = await Order.findOne({ owner: q.uid, utr, _id: { $ne: o._id } });
  o.utr = utr;
  if (dup) { o.fraud = true; o.verified = false; } else { o.verified = true; o.fraud = false; o.status = 'Paid'; }
  await o.save(); s.json(o);
}));

r.get('/insights', wrap(async (q, s) => {
  const u = await User.findById(q.uid), pk = u.packaging ?? 10, lm = u.lostMins ?? 60;
  const orders = await Order.find({ owner: q.uid }), products = await Product.find({ owner: q.uid }), ex = await Expense.find({ owner: q.uid });
  const real = orders.filter(o => ['Paid', 'Packed', 'Shipped', 'Delivered'].includes(o.status));
  const revenue = real.reduce((a, o) => a + o.total, 0), cogs = real.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty * i.cost, 0), 0);
  const packaging = real.length * pk, expenses = ex.reduce((a, e) => a + e.amount, 0);
  const daily = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i);
    return { day: d.toLocaleDateString('en-IN', { weekday: 'short' }), v: real.filter(o => o.createdAt >= d && o.createdAt < new Date(+d + 864e5)).reduce((a, o) => a + o.total, 0) }; });
  const best = {}; real.forEach(o => o.items.forEach(i => best[i.name] = (best[i.name] || 0) + i.qty));
  const funnel = {}; orders.forEach(o => funnel[o.status] = (funnel[o.status] || 0) + 1);
  s.json({ revenue, cogs, packaging, expenses, profit: revenue - cogs - packaging - expenses, daily, funnel, newOrders: funnel.New || 0,
    lost: orders.filter(o => o.status === 'Enquiry' && Date.now() - o.createdAt > lm * 60000), fraud: orders.filter(o => o.fraud),
    lowStock: products.filter(p => p.stock <= p.low), best: Object.entries(best).sort((a, b) => b[1] - a[1]) });
}));
r.get('/customers', wrap(async (q, s) => {
  const m = {};
  (await Order.find({ owner: q.uid, status: { $nin: ['Enquiry', 'Draft'] } })).forEach(o => {
    const c = m[o.customer] ??= { name: o.customer, orders: 0, spent: 0, fraud: 0, cancelled: 0 };
    c.orders++; if (o.status !== 'Cancelled') c.spent += o.total; if (o.fraud) c.fraud++; if (o.status === 'Cancelled') c.cancelled++; });
  s.json(Object.values(m).map(c => { const risk = Math.min(100, c.fraud * 50 + c.cancelled * 25 + (c.orders === 1 ? 10 : 0));
    return { ...c, risk, level: risk >= 50 ? 'High' : risk >= 25 ? 'Medium' : 'Low' }; }).sort((a, b) => b.spent - a.spent));
}));
r.get('/expenses', wrap(async (q, s) => s.json(await Expense.find({ owner: q.uid }).sort('-createdAt'))));
r.post('/expenses', wrap(async (q, s) => { if (!(q.body.amount > 0)) throw new Error('Enter a valid amount'); s.json(await Expense.create({ ...q.body, owner: q.uid })); }));
r.delete('/expenses/:id', wrap(async (q, s) => { await Expense.deleteOne({ _id: q.params.id, owner: q.uid }); s.json({ ok: 1 }); }));
r.get('/settings', wrap(async (q, s) => s.json(await User.findById(q.uid).select('packaging lostMins'))));
r.put('/settings', wrap(async (q, s) => s.json(await User.findByIdAndUpdate(q.uid, { packaging: q.body.packaging, lostMins: q.body.lostMins }, { new: true }).select('packaging lostMins'))));
r.get('/ai/status', wrap(async (q, s) => {
  try { await fetch(process.env.OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(1500) }); s.json({ online: true, model: process.env.OLLAMA_MODEL }); }
  catch { s.json({ online: false }); }
}));
r.post('/ai/reply', wrap(async (q, s) => s.json({ reply: await draftReply(q.body.text || '', q.body.lang || 'English') })));
r.post('/demo', wrap(async (q, s) => {
  const o = q.uid, ago = h => new Date(Date.now() - h * 36e5), it = (name, qty, price, cost) => ({ name, qty, price, cost });
  await Product.insertMany([{ owner: o, name: 'Scrunchie', price: 50, cost: 20, stock: 40 }, { owner: o, name: 'Hair Clip', price: 30, cost: 10, stock: 4 },
    { owner: o, name: 'Hair Band', price: 80, cost: 35, stock: 25 }, { owner: o, name: 'Bridal Hair Pin', price: 250, cost: 110, stock: 12 }]);
  const mk = (customer, items, status, h, x = {}) => ({ owner: o, customer, items, status, createdAt: ago(h), total: items.reduce((a, i) => a + i.qty * i.price, 0), ...x });
  await Order.insertMany([
    mk('Priya', [it('Scrunchie', 2, 50, 20)], 'Delivered', 70, { utr: 'UTR1001', verified: true }),
    mk('Divya', [it('Hair Band', 3, 80, 35)], 'Shipped', 50, { utr: 'UTR1002', verified: true }),
    mk('Meena', [it('Bridal Hair Pin', 1, 250, 110)], 'Packed', 30, { utr: 'UTR1003', verified: true }),
    mk('Kavya', [it('Scrunchie', 4, 50, 20)], 'Paid', 8, { utr: 'UTR1004', verified: true }),
    mk('Anitha', [it('Hair Clip', 2, 30, 10)], 'New', 2),
    mk('Sneha', [it('Hair Band', 1, 80, 35)], 'New', 1, { utr: 'UTR1001', fraud: true, verified: false }),
    mk('Ritu', [it('Hair Clip', 1, 30, 10)], 'Cancelled', 90),
    mk('Lakshmi', [], 'Enquiry', 5, { rawChat: 'Hi, what is the price of the bridal hair pin set?' })]);
  await Expense.insertMany([{ owner: o, type: 'Ad spend', amount: 150 }, { owner: o, type: 'Courier', amount: 120 }]);
  s.json({ ok: 1 });
}));
module.exports = r;
