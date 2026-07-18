/**
 * BRAND SPEED — Leads Sheet Web App
 *
 * Deploy: Google Sheet → Extensions → Apps Script → paste this file → Deploy →
 * New deployment → type "Web app" → Execute as "Me" → Who has access "Anyone" →
 * Deploy → copy the Web App URL → that's GOOGLE_SHEET_WEBHOOK_URL in Vercel.
 *
 * Also set SHEET_SECRET below to any random string, and put the SAME string
 * as GOOGLE_SHEET_SECRET in Vercel — this stops randoms on the internet from
 * writing junk rows into your sheet (the Web App URL itself is guessable/public).
 *
 * Matching strategy: each lead gets a unique deposit amount (4,950,000đ + a
 * small random cents-like offset, e.g. 4,950,023đ) instead of a flat shared
 * amount. Real bank transfer content does NOT reliably preserve the order
 * code we put in the VietQR "des" field (confirmed from live test data), so
 * exact-amount matching is the only reliable way to identify who paid.
 */

const SHEET_SECRET = 'REPLACE_WITH_A_RANDOM_STRING'; // must match GOOGLE_SHEET_SECRET in Vercel
const SHEET_NAME = 'Leads'; // tab name — script creates it if missing

const COLUMNS = [
  'timestamp', 'name', 'phone', 'email', 'orderCode', 'depositAmount',
  'paid', 'paidAt', 'reminderEmailId',
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
  }
  return sheet;
}

function findRowByOrderCode_(sheet, orderCode) {
  const data = sheet.getDataRange().getValues();
  const codeCol = COLUMNS.indexOf('orderCode');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][codeCol]) === String(orderCode)) return i + 1; // 1-indexed row
  }
  return null;
}

// Finds the most recent UNPAID row whose depositAmount matches exactly.
function findUnpaidRowByAmount_(sheet, amount) {
  const data = sheet.getDataRange().getValues();
  const amountCol = COLUMNS.indexOf('depositAmount');
  const paidCol = COLUMNS.indexOf('paid');
  for (let i = data.length - 1; i >= 1; i--) {
    if (Number(data[i][amountCol]) === Number(amount) && data[i][paidCol] !== true) {
      return i + 1;
    }
  }
  return null;
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ error: 'Invalid JSON' }, 400);
  }

  if (payload.secret !== SHEET_SECRET) {
    return jsonResponse_({ error: 'Unauthorized' });
  }

  const sheet = getSheet_();
  const action = payload.action;

  if (action === 'save_lead') {
    sheet.appendRow([
      new Date(), payload.name || '', payload.phone || '',
      payload.email || '', payload.orderCode || '', payload.depositAmount || '',
      false, '', '',
    ]);
    return jsonResponse_({ success: true });
  }

  if (action === 'update_reminder_id') {
    const row = findRowByOrderCode_(sheet, payload.orderCode);
    if (!row) return jsonResponse_({ error: 'orderCode not found' });
    sheet.getRange(row, COLUMNS.indexOf('reminderEmailId') + 1).setValue(payload.reminderEmailId || '');
    return jsonResponse_({ success: true });
  }

  if (action === 'mark_paid_by_amount') {
    const row = findUnpaidRowByAmount_(sheet, payload.depositAmount);
    if (!row) return jsonResponse_({ success: true, found: false });
    const values = sheet.getRange(row, 1, 1, COLUMNS.length).getValues()[0];
    sheet.getRange(row, COLUMNS.indexOf('paid') + 1).setValue(true);
    sheet.getRange(row, COLUMNS.indexOf('paidAt') + 1).setValue(new Date());
    return jsonResponse_({
      success: true,
      found: true,
      name: values[COLUMNS.indexOf('name')],
      email: values[COLUMNS.indexOf('email')],
      phone: values[COLUMNS.indexOf('phone')],
      orderCode: values[COLUMNS.indexOf('orderCode')],
      reminderEmailId: values[COLUMNS.indexOf('reminderEmailId')],
    });
  }

  return jsonResponse_({ error: 'Unknown action' });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
