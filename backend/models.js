const m = require('mongoose'), S = m.Schema;
const User = m.model('User', new S({ name: String, email: { type: String, unique: true }, pass: String, packaging: { type: Number, default: 10 }, lostMins: { type: Number, default: 60 } }));
const Product = m.model('Product', new S({ owner: S.Types.ObjectId, name: String, price: Number, cost: Number, stock: Number, low: { type: Number, default: 5 } }));
const Order = m.model('Order', new S({
  owner: S.Types.ObjectId, customer: String, rawChat: String,
  items: [{ name: String, qty: Number, price: Number, cost: Number }],
  total: Number, status: { type: String, default: 'Draft' }, // Enquiry, Draft, New, Paid, Packed, Shipped, Delivered, Cancelled
  utr: String, verified: Boolean, fraud: Boolean, createdAt: { type: Date, default: Date.now }
}));
const Expense = m.model('Expense', new S({ owner: S.Types.ObjectId, type: String, amount: Number, createdAt: { type: Date, default: Date.now } }));
module.exports = { User, Product, Order, Expense };
