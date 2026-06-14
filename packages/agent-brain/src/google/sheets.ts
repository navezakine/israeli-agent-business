// google/sheets.ts — append interaction logs to a client's Google Sheet.
// Privacy (Amendment 13): we log only timestamp, last-4 of phone, intent,
// action, and HITL flag — never message content or full numbers.

import { google } from 'googleapis';

function getSheets() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function appendLogRow(sheetId: string, row: string[]): Promise<void> {
  await getSheets().spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}
