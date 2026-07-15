// Vercel serverless function — captures customer info from Checkout Step 1
// (name, phone, email) BEFORE they scan the QR, so Huynh has contact details
// even if the buyer never completes the transfer.
//
// No API-key auth here (unlike sepay-webhook.js) — this is called directly by
// our own page's JS, there's no third party to authenticate. Just validate input.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { name, phone, email, orderCode } = req.body || {};

  if (!name || !phone || !email) {
    res.status(400).json({ error: 'Missing name, phone, or email' });
    return;
  }

  // Respond first so the buyer's browser isn't stuck waiting on Telegram's round-trip.
  res.status(200).json({ success: true });

  notifyTelegram({ name, phone, email, orderCode });
};

async function notifyTelegram({ name, phone, email, orderCode }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping lead notify');
    return;
  }

  const message =
    `🆕 *BRAND SPEED — Lead mới, sắp thanh toán*\n\n` +
    `👤 Tên: ${name}\n` +
    `📞 SĐT: ${phone}\n` +
    `📧 Email: ${email}\n` +
    `🔖 Mã đơn (sẽ khớp với nội dung CK): \`${orderCode || 'N/A'}\`\n\n` +
    `Người này vừa xem mã QR. Nếu 10-15 phút nữa chưa thấy tin nhắn "đã nhận tiền" từ bot, có thể chủ động nhắn hỏi.`;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) {
      console.error('Telegram API error:', resp.status, await resp.text());
    }
  } catch (err) {
    console.error('Failed to send lead Telegram notification:', err);
  }
}
