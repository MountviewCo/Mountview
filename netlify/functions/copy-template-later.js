'use strict';

const crypto = require('crypto');

const COOKIE_REFRESH = 'mv_google_refresh_token';

function parseCookies(rawCookie) {
  if (!rawCookie) return {};
  return rawCookie.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    acc[key] = val;
    return acc;
  }, {});
}

function getEncryptionKey() {
  const b64 = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be base64 for 32 random bytes.');
  }
  return key;
}

function decryptRefreshToken(payload) {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

async function getAccessTokenFromRefreshToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Refresh-token exchange failed: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Use POST' })
    };
  }

  if (!process.env.GOOGLE_TEMPLATE_FILE_ID) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Missing GOOGLE_TEMPLATE_FILE_ID' })
    };
  }

  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
  const encrypted = cookies[COOKIE_REFRESH];
  if (!encrypted) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'No connected Google account found. Connect first.' })
    };
  }

  let refreshToken;
  try {
    refreshToken = decryptRefreshToken(encrypted);
  } catch (err) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Stored token is invalid. Reconnect Google.', details: err.message })
    };
  }

  let payload = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    payload = {};
  }

  const desiredName = typeof payload.sheetName === 'string' && payload.sheetName.trim()
    ? payload.sheetName.trim()
    : `Mountview Database ${new Date().toISOString().slice(0, 10)}`;

  try {
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);

    const copyRes = await fetch(`https://www.googleapis.com/drive/v3/files/${process.env.GOOGLE_TEMPLATE_FILE_ID}/copy?supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        name: desiredName,
        mimeType: 'application/vnd.google-apps.spreadsheet'
      })
    });

    const copyData = await copyRes.json();
    if (!copyRes.ok) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to copy template', details: copyData })
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        fileId: copyData.id,
        name: copyData.name,
        webViewLink: `https://docs.google.com/spreadsheets/d/${copyData.id}/edit`
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Copy failed', details: err.message })
    };
  }
};
