// Vercel serverless function — handles the "Chưa sẵn sàng? Để lại thông tin"
// email-only capture near the bottom of the page (lighter than the full
// Bước 1/2 checkout — just an email, no phone/name required).

const { saveSubscriber } = require('../lib/sheet');
const { sendEmail, subscribeConfirmationEmail } = require('../lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  const { subject, html } = subscribeConfirmationEmail();

  await Promise.all([
    notifyTelegram(email),
    saveSubscriber(email),
    sendEmail({ to: email, subject, html }),
  ]);

  res.status(200).json({ success: true });
};

async function notifyTelegram(email) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn('Telegram not configured — skipping subscriber notify');
    return;
  }
  const message = `📩 *BRAND SPEED — Đăng ký nhận tin*\n\nEmail: ${email}\n\nChưa sẵn sàng mua ngay, muốn nghe tin cập nhật sau.`;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) console.error('Telegram API error:', resp.status, await resp.text());
  } catch (err) {
    console.error('Failed to send subscriber Telegram notification:', err);
  }
}
