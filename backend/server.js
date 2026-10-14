require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

app.get('/', (req, res) => res.send('ShopSakhi API running 🎀'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai', require('./routes/ai'));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    // 0.0.0.0 => phone-la irundhu same Wi-Fi la access panna mudiyum
    app.listen(process.env.PORT, '0.0.0.0', () =>
      console.log(`Server on port ${process.env.PORT}`)
    );
  })
  .catch((e) => console.error('Mongo error:', e.message));