// Shared helper — talks to the Google Apps Script Web App that backs the
// "Leads" Google Sheet (see google-apps-script/leads-sheet.gs).
// Env vars: GOOGLE_SHEET_WEBHOOK_URL, GOOGLE_SHEET_SECRET.

async function callSheet(action, data) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const secret = process.env.GOOGLE_SHEET_SECRET;
  if (!webhookUrl) {
    console.warn(`Google Sheet not configured (GOOGLE_SHEET_WEBHOOK_URL missing) — skipping "${action}"`);
    return null;
  }
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, secret, ...data }),
      redirect: 'follow', // Apps Script Web Apps 302-redirect to the real response URL
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || (json && json.error)) {
      console.error(`Google Sheet "${action}" error:`, resp.status, json);
      return null;
    }
    return json;
  } catch (err) {
    console.error(`Failed to call Google Sheet "${action}":`, err);
    return null;
  }
}

const saveLead = (data) => callSheet('save_lead', data);
const updateReminderId = (orderCode, reminderEmailId) =>
  callSheet('update_reminder_id', { orderCode, reminderEmailId });
// Returns { found, name, email, phone, orderCode, reminderEmailId } or null.
const markPaidByAmount = (depositAmount) => callSheet('mark_paid_by_amount', { depositAmount });

module.exports = { saveLead, updateReminderId, markPaidByAmount };
