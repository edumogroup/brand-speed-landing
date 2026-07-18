// Vercel serverless function — captures customer info from Checkout Step 1
// (name, phone, email) BEFORE they scan the QR, so Huynh has contact details
// even if the buyer never completes the transfer.
//
// No API-key auth here (unlike sepay-webhook.js) — this is called directly by
// our own page's JS, there's no third party to authenticate. Just validate input.

const { saveLead, updateReminderId } = require('../lib/sheet');
const { sendEmail, reminderEmail } = require('../lib/email');

const BASE_DEPOSIT = 4950000;

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

  // Unique deposit amount per lead (base + small random offset) — real bank
  // transfer content does NOT reliably preserve the order code we put in the
  // VietQR "des" field (confirmed from live test data), so the payment webhook
  // matches by this exact amount instead of by content text.
  const depositAmount = BASE_DEPOSIT + Math.floor(Math.random() * 9999) + 1;

  // Await everything before responding — Vercel serverless functions can
  // freeze/terminate right after the response is sent, killing any un-awaited
  // "fire-and-forget" work in flight (this silently dropped notifications before).
  await Promise.all([
    notifyTelegram({ name, phone, email, orderCode, depositAmount }),
    saveLead({ name, phone, email, orderCode, depositAmount }),
  ]);

  // Schedule the "chưa thanh toán" reminder for 30 minutes from now. If payment
  // arrives before then, sepay-webhook.js cancels it via the stored email id.
  const { subject, html } = reminderEmail({ name });
  const reminderEmailId = await sendEmail({ to: email, subject, html, scheduledAt: 'in 30 min' });
  if (reminderEmailId) {
    await updateReminderId(orderCode, reminderEmailId);
  }

  res.status(200).json({ success: true, depositAmount });
};

async function notifyTelegram({ name, phone, email, orderCode, depositAmount }) {
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
    `💵 Số tiền cần khớp: \`${Number(depositAmount).toLocaleString('vi-VN')} VNĐ\`\n` +
    `🔖 Mã đơn: \`${orderCode || 'N/A'}\`\n\n` +
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
