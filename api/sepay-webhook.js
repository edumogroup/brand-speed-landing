// Vercel serverless function — receives SePay payment notifications.
// Deploy path: https://<your-domain>/api/sepay-webhook  (paste this exact URL into SePay dashboard → Webhooks)
//
// Auth method used: API Key header, per SePay docs (https://docs.sepay.vn/tich-hop-webhooks.html).
// SePay sends:  Authorization: Apikey <the key you set in their dashboard>
// Set the SAME key as an environment variable SEPAY_API_KEY in Vercel (Project → Settings → Environment Variables).
// Never hardcode the key here.
//
// Confirmed working 2026-07-18: SePay dashboard auth method must be set to
// "API Key" (not HMAC-SHA256) for this header-based check to receive anything.

const { markPaidByAmount } = require('../lib/sheet');
const { sendEmail, cancelScheduledEmail, paidConfirmationEmail, onboardingEmail } = require('../lib/email');

// In-memory dedup guard — resets on cold start. Good enough for a 9-seat Founding Cohort;
// swap for a real store (KV/Postgres) if volume grows.
const seenTransactionIds = new Set();

// Sends the deposit alert to Huynh's Telegram — instant, no dashboard/log checking needed.
async function notifyTelegram({ id, gateway, transactionDate, transferAmount, content, matchedLead }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.warn('Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) — skipping notify');
    return;
  }

  const amountFormatted = Number(transferAmount || 0).toLocaleString('vi-VN');
  const leadLines = matchedLead && matchedLead.found
    ? `👤 Khách: ${matchedLead.name}\n📞 SĐT: ${matchedLead.phone}\n📧 Email: ${matchedLead.email}\n✅ Đã tự động gửi email xác nhận + hướng dẫn học tập.\n\n`
    : `⚠️ Không khớp được với lead nào trong sheet (có thể là chuyển khoản test) — kiểm tra thủ công.\n\n`;

  const message =
    `💰 *BRAND SPEED — Founding Cohort*\n\n` +
    `Có người vừa đặt cọc giữ suất!\n\n` +
    leadLines +
    `💵 Số tiền: \`${amountFormatted} VND\`\n` +
    `🏦 Ngân hàng: ${gateway || 'N/A'}\n` +
    `🔖 Mã GD: ${id || 'N/A'}\n` +
    `⏰ ${transactionDate || new Date().toLocaleString('vi-VN')}\n\n` +
    (matchedLead && matchedLead.found
      ? `👉 Nhắn Zalo ${matchedLead.name} để xác nhận + bắt đầu onboard.`
      : `👉 Vào lịch sử giao dịch MBBank để xem người chuyển, đối chiếu thủ công.`);

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
  const envKey = process.env.SEPAY_API_KEY || '';
  const expected = `Apikey ${envKey}`;

  if (!envKey || authHeader !== expected) {
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
    content,          // transfer content/memo — real bank content is unreliable
                       // for per-customer matching (confirmed live), used only
                       // as a loose sanity filter here, not the match key.
    transferType,     // "in" or "out"
    transferAmount,   // VND — this is the real match key (see save-lead.js)
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

    // 4. Identify WHICH lead this is by exact deposit amount (unique per lead).
    const matchedLead = await markPaidByAmount(transferAmount);

    if (matchedLead && matchedLead.found) {
      // Cancel the pending "chưa thanh toán" reminder so it doesn't awkwardly
      // arrive after they've already paid.
      if (matchedLead.reminderEmailId) {
        await cancelScheduledEmail(matchedLead.reminderEmailId);
      }

      const confirm = paidConfirmationEmail({
        name: matchedLead.name, amount: transferAmount, orderCode: matchedLead.orderCode,
      });
      const onboarding = onboardingEmail({ name: matchedLead.name });

      await Promise.all([
        sendEmail({ to: matchedLead.email, subject: confirm.subject, html: confirm.html }),
        sendEmail({ to: matchedLead.email, subject: onboarding.subject, html: onboarding.html }),
      ]);
    }

    // Because Founding Cohort is high-touch (9 seats, personal onboarding),
    // Huynh still follows up 1:1 via Zalo — these emails/Telegram just make
    // sure nothing falls through the cracks while he does that.
    await notifyTelegram({ id, gateway, transactionDate, transferAmount, content, matchedLead });
    res.status(200).json({ success: true });
    return;
  }

  // Not a matching deposit — still ack so SePay stops retrying.
  res.status(200).json({ success: true });
};
