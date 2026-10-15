require('dotenv').config();
const express = require('express'), cors = require('cors'), mongoose = require('mongoose'), path = require('path');
const app = express();
app.use(cors(), express.json());
app.use('/api', require('./routes'));
app.use(express.static(path.join(__dirname, '../frontend'))); // frontend folder-a serve pannum
mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('MongoDB connected');
  app.listen(process.env.PORT || 5000, () => console.log('Open: http://localhost:' + (process.env.PORT || 5000)));
}).catch(e => console.log('MongoDB error:', e.message));
