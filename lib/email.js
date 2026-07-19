// Shared helper — sends transactional email via Resend (resend.com).
// Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL (e.g. "hello@send.brandspeed.hoanghuynh.vn"),
// RESEND_FROM_NAME (e.g. "Huynh - BRAND SPEED").

const RESEND_API = 'https://api.resend.com/emails';

function fromHeader() {
  const name = process.env.RESEND_FROM_NAME || 'BRAND SPEED';
  const email = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  return `${name} <${email}>`;
}

// Returns the Resend email id on success (needed later to cancel a scheduled
// send), or null if Resend isn't configured / the call failed.
async function sendEmail({ to, subject, html, scheduledAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('Resend not configured (RESEND_API_KEY missing) — skipping email:', subject);
    return null;
  }
  try {
    const body = { from: fromHeader(), to: [to], subject, html };
    if (scheduledAt) body.scheduled_at = scheduledAt;

    const resp = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('Resend send error:', resp.status, json);
      return null;
    }
    return json && json.id ? json.id : null;
  } catch (err) {
    console.error('Failed to send email via Resend:', err);
    return null;
  }
}

async function cancelScheduledEmail(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return;
  try {
    const resp = await fetch(`${RESEND_API}/${emailId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      // Not fatal — the scheduled email may have already sent (past the 30-min
      // window) or already been cancelled. Log and move on either way.
      console.warn('Resend cancel returned non-OK (may already be sent):', resp.status);
    }
  } catch (err) {
    console.error('Failed to cancel scheduled email:', err);
  }
}

// ---- Templates ----

function wrapLayout(bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0B1B2B;">
      <div style="background:#0B1B2B;padding:24px;text-align:center;">
        <span style="color:#F59E0B;font-size:20px;font-weight:bold;">BRAND SPEED</span>
      </div>
      <div style="padding:24px;background:#F5F7FA;">${bodyHtml}</div>
      <div style="padding:16px;text-align:center;color:#5C7A99;font-size:12px;">
        BRAND SPEED — Hoàng Quốc Huynh
      </div>
    </div>`;
}

// Sent immediately at Checkout Step 1, delivery scheduled for +30 minutes.
// Cancelled automatically if payment arrives before then (see sepay-webhook.js).
function reminderEmail({ name }) {
  return {
    subject: 'Anh/chị chưa hoàn tất giữ suất Founding Cohort — BRAND SPEED',
    html: wrapLayout(`
      <p>Chào ${name || 'anh/chị'},</p>
      <p>Em thấy anh/chị vừa xem mã QR để giữ suất <b>Founding Cohort BRAND SPEED</b> nhưng có vẻ chưa hoàn tất chuyển khoản.</p>
      <p>Founding Cohort chỉ còn <b>9 suất</b> — nếu anh/chị vẫn muốn giữ chỗ, quay lại trang và quét mã QR để đặt cọc <b>4.950.000đ</b>.</p>
      <p><a href="https://brandspeed.hoanghuynh.vn/#pricing" style="background:#F59E0B;color:#0B1B2B;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Quay lại giữ suất</a></p>
      <p>Có thắc mắc gì, nhắn lại email này hoặc Zalo cho Huynh nhé.</p>
    `),
  };
}

// Sent immediately when SePay webhook confirms the deposit landed.
function paidConfirmationEmail({ name, amount, orderCode }) {
  const amountFormatted = Number(amount || 0).toLocaleString('vi-VN');
  return {
    subject: 'Đã nhận đặt cọc — Founding Cohort BRAND SPEED ✓',
    html: wrapLayout(`
      <p>Chào ${name || 'anh/chị'},</p>
      <p>Huynh xác nhận đã nhận được <b>${amountFormatted} VNĐ</b> đặt cọc giữ suất Founding Cohort.</p>
      <p>Mã đơn: <code>${orderCode || ''}</code></p>
      <p>Huynh sẽ chủ động nhắn Zalo trong hôm nay để xác nhận thông tin và bắt đầu đồng hành cùng anh/chị.</p>
      <p>Cảm ơn anh/chị đã tin tưởng!</p>
    `),
  };
}

// Sent right after the confirmation — placeholder content, fill in real
// Zoom link / materials / schedule once available.
function onboardingEmail({ name }) {
  return {
    subject: 'Bắt đầu hành trình BRAND SPEED — hướng dẫn cho anh/chị',
    html: wrapLayout(`
      <p>Chào ${name || 'anh/chị'},</p>
      <p>Chào mừng anh/chị đến với BRAND SPEED! Đây là những gì cần chuẩn bị cho tuần đầu tiên:</p>
      <ul>
        <li>Link nhóm coaching: [ĐIỀN LINK ZOOM/TELEGRAM NHÓM]</li>
        <li>Lịch coaching nhóm hàng tuần: [ĐIỀN LỊCH CỤ THỂ]</li>
        <li>Khóa video quy trình AI: [ĐIỀN LINK TRUY CẬP]</li>
        <li>Bộ 50+ prompt AI: [ĐIỀN LINK TẢI VỀ]</li>
      </ul>
      <p>Bước 1 (Tuần 1): xác định rõ mục tiêu thương hiệu — Huynh sẽ liên hệ trực tiếp để bắt đầu.</p>
      <p>Hẹn gặp anh/chị trong buổi coaching đầu tiên!</p>
    `),
  };
}

// Sent immediately when someone submits the "Chưa sẵn sàng?" email-only form
// further down the page (not the full Bước 1/2 checkout).
function subscribeConfirmationEmail() {
  return {
    subject: 'Đã ghi nhận — sẽ báo anh/chị khi có tin mới từ BRAND SPEED',
    html: wrapLayout(`
      <p>Chào anh/chị,</p>
      <p>Cảm ơn anh/chị đã quan tâm đến <b>BRAND SPEED</b>. Huynh đã ghi nhận email này.</p>
      <p>Anh/chị sẽ là người đầu tiên biết khi Founding Cohort mở lại, hoặc khi có case study thật từ 9 học viên sáng lập.</p>
      <p>Trong lúc chờ, nếu muốn giữ suất ngay, anh/chị có thể quay lại trang bất cứ lúc nào:</p>
      <p><a href="https://brandspeed.hoanghuynh.vn/#pricing" style="background:#F59E0B;color:#0B1B2B;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Xem Founding Cohort</a></p>
    `),
  };
}

module.exports = {
  sendEmail,
  cancelScheduledEmail,
  reminderEmail,
  paidConfirmationEmail,
  onboardingEmail,
  subscribeConfirmationEmail,
};
