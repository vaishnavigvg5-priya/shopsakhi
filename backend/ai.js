// Local Ollama only - API key illa
const mask = t => t.replace(/\b\d{10}\b/g, 'XXXXXXXXXX');
const SENSITIVE = /(otp|password|pin number|cvv)/i;

async function parseChat(chat, products) {
  if (SENSITIVE.test(chat)) throw new Error('Message contains sensitive words (OTP/password), so it was not sent to AI');
  const safe = mask(chat);
  const names = products.map(p => p.name).join(', ');
  const prompt = `You read Instagram/WhatsApp seller chats (Tamil/English/Tanglish).
Products: ${names}
Return ONLY JSON: {"type":"order" or "enquiry","customer":"name or Unknown","items":[{"name":"product from list","qty":number}]}
type=order only if customer clearly wants to buy. Otherwise enquiry.
Example: "akka 2 scrunchie venum, GPay panren" -> {"type":"order","customer":"Unknown","items":[{"name":"Scrunchie","qty":2}]}
Chat: ${safe}`;
  try {
    const r = await fetch(process.env.OLLAMA_URL + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL, stream: false, format: 'json',
        options: { temperature: 0 }, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await r.json();
    return { ...JSON.parse(d.message.content), ai: 'ollama' };
  } catch (e) { // Ollama off-na simple fallback, app crash aagaadhu
    const items = [];
    products.forEach(p => { if (chat.toLowerCase().includes(p.name.toLowerCase())) {
      const q = chat.match(new RegExp('(\\d+)\\s*' + p.name, 'i')); items.push({ name: p.name, qty: q ? +q[1] : 1 }); } });
    const buy = /(venum|order|buy|gpay|paid|confirm|anuppu)/i.test(chat);
    return { type: buy && items.length ? 'order' : 'enquiry', customer: 'Unknown', items, ai: 'fallback' };
  }
}
async function draftReply(text, lang) {
  const fb = { English: 'Hi! Thanks for reaching out. The item is in stock. Shall I confirm your order?',
    Tamil: 'வணக்கம்! விசாரித்ததற்கு நன்றி. இந்த பொருள் கையிருப்பில் உள்ளது. உங்கள் ஆர்டரை உறுதி செய்யலாமா?',
    Tanglish: 'Hi! Thanks for asking. Stock irukku. Order confirm pannalama?' };
  try {
    const r = await fetch(process.env.OLLAMA_URL + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL, stream: false, options: { temperature: 0.4 },
        messages: [{ role: 'user', content: `Write a short, friendly reply in ${lang} from a small shop owner to this customer message. Say the item is available and ask if they want to confirm the order. Return only the reply.\nMessage: ${mask(text)}` }] }) });
    return (await r.json()).message.content.trim();
  } catch { return fb[lang] || fb.English; }
}
module.exports = { parseChat, draftReply };

