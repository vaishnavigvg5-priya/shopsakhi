const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth, allow } = require('../middleware/auth');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

function makeToken(u) {
  // shopId = owner-oda id (staff-ku avanga owner id)
  const shopId = u.role === 'owner' ? u._id : u.owner;
  return jwt.sign(
    { id: u._id, role: u.role, shopId },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function publicUser(u) {
  return { id: u._id, name: u.name, username: u.username, role: u.role, shopName: u.shopName };
}

// 1) Owner register (puthu shop)
router.post('/register-owner', async (req, res) => {
  try {
    const { name, shopName, username, password } = req.body;
    if (!name || !shopName || !username || !password)
      return res.status(400).json({ message: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({ name, shopName, username, passwordHash, role: 'owner' });
    res.status(201).json({ token: makeToken(u), user: publicUser(u) });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// 2) Login (role check + lockout)
router.post('/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const u = await User.findOne({ username: (username || '').toLowerCase().trim() });
    if (!u || !u.active)
      return res.status(401).json({ message: 'Invalid username or password' });

    if (u.lockUntil && u.lockUntil > new Date())
      return res.status(423).json({ message: `Too many attempts. Try again after ${LOCK_MINUTES} minutes` });

    const ok = await bcrypt.compare(password || '', u.passwordHash);
    if (!ok) {
      u.failedAttempts += 1;
      if (u.failedAttempts >= MAX_ATTEMPTS) {
        u.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        u.failedAttempts = 0;
      }
      await u.save();
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    if (role && u.role !== role)
      return res.status(403).json({ message: `This is not a ${role} account` });

    u.failedAttempts = 0;
    u.lockUntil = null;
    await u.save();
    res.json({ token: makeToken(u), user: publicUser(u) });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

// 3) Current user
router.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u || !u.active) return res.status(401).json({ message: 'Account disabled' });
  res.json({ user: publicUser(u) });
});

// 4) Owner staff/packer create pannuvaanga
router.post('/team', auth, allow('owner'), async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!['staff', 'packer'].includes(role))
      return res.status(400).json({ message: 'Role must be staff or packer' });
    if (!name || !username || !password || password.length < 6)
      return res.status(400).json({ message: 'Name, username and 6+ char password required' });

    const exists = await User.findOne({ username: username.toLowerCase().trim() });
    if (exists) return res.status(409).json({ message: 'Username already taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const u = await User.create({ name, username, passwordHash, role, owner: req.user.id });
    res.status(201).json({ user: publicUser(u) });
  } catch (e) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/team', auth, allow('owner'), async (req, res) => {
  const list = await User.find({ owner: req.user.id }).sort({ createdAt: -1 });
  res.json({ team: list.map((u) => ({ ...publicUser(u), active: u.active })) });
});

// Owner staff-a disable/enable pannalaam
router.patch('/team/:id/toggle', auth, allow('owner'), async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, owner: req.user.id });
  if (!u) return res.status(404).json({ message: 'Not found' });
  u.active = !u.active;
  await u.save();
  res.json({ active: u.active });
});

module.exports = router;