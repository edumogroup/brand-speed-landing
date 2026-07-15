// Vercel serverless function — receives SePay payment notifications.
// Deploy path: https://<your-domain>/api/sepay-webhook  (paste this exact URL into SePay dashboard → Webhooks)
//
// Auth method used: API Key header, per SePay docs (https://docs.sepay.vn/tich-hop-webhooks.html).
// SePay sends:  Authorization: Apikey <the key you set in their dashboard>
// Set the SAME key as an environment variable SEPAY_API_KEY in Vercel (Project → Settings → Environment Variables).
// Never hardcode the key here.

// In-memory dedup guard — resets on cold start. Good enough for a 9-seat Founding Cohort;
// swap for a real store (KV/Postgres) if volume grows.
const seenTransactionIds = new Set();

// Sends the deposit alert to Huynh's Telegram — instant, no dashboard/log checking needed.
// Requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID env vars (see payment-setup-guide.md).
async function notifyTelegram({ id, gateway, transactionDate, transferAmount, content }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping notify');
    return;
  }

  const amountFormatted = Number(transferAmount || 0).toLocaleString('vi-VN');
  // Order code from Checkout Step 1 is "BRANDSPEED" + phone digits — strip the
  // prefix so this lines up visually with the SĐT in the earlier "Lead mới" alert.
  const phoneFromContent = typeof content === 'string'
    ? content.toUpperCase().replace('BRANDSPEED', '').trim()
    : '';

  const message =
    `💰 *BRAND SPEED — Founding Cohort*\n\n` +
    `Có người vừa đặt cọc giữ suất!\n\n` +
    `💵 Số tiền: \`${amountFormatted} VND\`\n` +
    `🏦 Ngân hàng: ${gateway || 'N/A'}\n` +
    `📝 Nội dung CK: ${content || 'N/A'}\n` +
    (phoneFromContent ? `📞 SĐT khớp lead: \`${phoneFromContent}\`\n` : '') +
    `🔖 Mã GD: ${id || 'N/A'}\n` +
    `⏰ ${transactionDate || new Date().toLocaleString('vi-VN')}\n\n` +
    `👉 Tìm tin nhắn "Lead mới" có cùng SĐT ở trên để lấy tên + email, ` +
    `rồi nhắn Zalo xác nhận + bắt đầu onboard.`;

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
    console.error('Failed to send Telegram notification:', err);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // 1. Verify the API key SePay sends in the Authorization header.
  const authHeader = req.headers['authorization'] || '';
  const expected = `Apikey ${process.env.SEPAY_API_KEY}`;
  if (!process.env.SEPAY_API_KEY || authHeader !== expected) {
    console.error('SePay webhook: invalid or missing API key');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body || {};
  const {
    id,               // SePay transaction id — use for dedup
    gateway,          // bank name, e.g. "MBBank"
    transactionDate,
    accountNumber,
    content,          // transfer content/memo — should contain "BRANDSPEED"
    transferType,     // "in" or "out"
    transferAmount,   // VND
  } = body;

  // 2. Dedup — SePay retries webhooks up to 7 times.
  if (id && seenTransactionIds.has(id)) {
    res.status(200).json({ success: true, note: 'duplicate, already processed' });
    return;
  }
  if (id) seenTransactionIds.add(id);

  // 3. Only care about money IN, on the BRAND SPEED account, with the right memo.
  const isBrandSpeedDeposit =
    transferType === 'in' &&
    accountNumber === '888888393988' &&
    typeof content === 'string' &&
    content.toUpperCase().includes('BRANDSPEED');

  if (isBrandSpeedDeposit) {
    console.log('BRAND SPEED — Founding Cohort deposit received:', {
      id, gateway, transactionDate, transferAmount, content,
    });

    // Because Founding Cohort is high-touch (9 seats, personal onboarding), we don't
    // auto-deliver anything — we just alert Huynh instantly so he can follow up 1:1.
    // 4. Respond to SePay first so it doesn't wait on Telegram's round-trip...
    res.status(200).json({ success: true });
    // ...then send the notification (fire-and-forget, doesn't block the ack above).
    notifyTelegram({ id, gateway, transactionDate, transferAmount, content });
    return;
  }

  // Not a matching deposit — still ack so SePay stops retrying.
  res.status(200).json({ success: true });
};
