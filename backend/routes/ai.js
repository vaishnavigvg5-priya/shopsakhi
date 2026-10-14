const express = require('express');
const { auth, allow } = require('../middleware/auth');

const router = express.Router();

const SENSITIVE = /\b(otp|password|pin|cvv|card number|passcode)\b/i;

function maskPII(text) {
  return text
    .replace(/(\+?91[\s-]?)?[6-9]\d{9}/g, '[PHONE]')
    .replace(/\b\d{12,16}\b/g, '[NUMBER]');
}

const SYSTEM = `You extract orders from chats of a small Indian online seller (hair accessories).
Chats are in Tamil, English or Tanglish. Reply ONLY with JSON in this exact shape:
{"intent":"order|enquiry|payment|other","customer_name":"","items":[{"name":"","color":"","qty":1}],"delivery_city":"","payment_status":"paid|pending|unknown","reply_suggestion":""}
Rules: qty is a number. If unknown use empty string. "GPay panniten"/"paid" means paid.
reply_suggestion is a short polite reply in Tanglish.

Example 1:
Chat: "Akka 3 scrunchies pink 2 black, 1 claw clip, Coimbatore ku courier, GPay panniten"
JSON: {"intent":"order","customer_name":"","items":[{"name":"scrunchie","color":"pink","qty":3},{"name":"scrunchie","color":"black","qty":2},{"name":"claw clip","color":"","qty":1}],"delivery_city":"Coimbatore","payment_status":"paid","reply_suggestion":"Payment vandhuduchu akka, order confirm! Courier details naalaiku anuprom."}

Example 2:
Chat: "claw clip price enna?"
JSON: {"intent":"enquiry","customer_name":"","items":[{"name":"claw clip","color":"","qty":1}],"delivery_city":"","payment_status":"unknown","reply_suggestion":"Hi! Claw clip price Rs.120. Colours available, endha colour venum?"}`;

router.post('/parse-order', auth, allow('owner', 'staff'), async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim())
      return res.status(400).json({ message: 'Message is empty' });

    if (SENSITIVE.test(message))
      return res.status(422).json({ message: 'Sensitive content detected. Message skipped for privacy.' });

    const safeText = maskPII(message).slice(0, 1500);

    const r = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Chat: "${safeText}"\nJSON:` },
        ],
      }),
    });

    if (!r.ok) throw new Error('Ollama error');
    const data = await r.json();
    const parsed = JSON.parse(data.message.content);
    res.json({ result: parsed });
  } catch (e) {
    res.status(502).json({ message: 'AI server not reachable. Is Ollama running?' });
  }
});

module.exports = router;