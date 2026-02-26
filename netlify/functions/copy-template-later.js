'use strict';

const crypto = require('crypto');

const COOKIE_REFRESH = 'mv_google_refresh_token';
const COOKIE_SHEET_ID = 'mv_google_sheet_id';

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

function makeCookie(name, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
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

async function getSpreadsheetById(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

function buildSheetName(companyNameRaw) {
  const base = typeof companyNameRaw === 'string' && companyNameRaw.trim()
    ? companyNameRaw.trim()
    : 'User Company Name';
  const suffix = ' - Mountview';
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Use POST' })
    };
  }

  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
  const encrypted = cookies[COOKIE_REFRESH];
  const existingSheetId = cookies[COOKIE_SHEET_ID];
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

  const desiredName = buildSheetName(payload.companyName);
  try {
    const accessToken = await getAccessTokenFromRefreshToken(refreshToken);
    if (existingSheetId) {
      const existing = await getSpreadsheetById(accessToken, existingSheetId);
      if (existing && existing.id) {
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ok: true,
            existing: true,
            fileId: existing.id,
            name: existing.name,
            webViewLink: `https://docs.google.com/spreadsheets/d/${existing.id}/edit`
          })
        };
      }
    }

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
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

    const createData = await createRes.json();
    if (!createRes.ok) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to create spreadsheet', details: createData })
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      multiValueHeaders: {
        'set-cookie': [
          makeCookie(COOKIE_SHEET_ID, createData.id, 60 * 60 * 24 * 30)
        ]
      },
      body: JSON.stringify({
        ok: true,
        existing: false,
        fileId: createData.id,
        name: createData.name,
        webViewLink: `https://docs.google.com/spreadsheets/d/${createData.id}/edit`
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Create failed', details: err.message })
    };
  }
};
