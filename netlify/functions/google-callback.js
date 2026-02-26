'use strict';

const crypto = require('crypto');

const COOKIE_STATE = 'mv_google_oauth_state';
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

function makeCookie(name, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getEncryptionKey() {
  const b64 = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be base64 for 32 random bytes.');
  }
  return key;
}

function encryptRefreshToken(refreshToken) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

exports.handler = async function handler(event) {
  const url = new URL(event.rawUrl || `https://local.invalid${event.path || ''}`);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
  const expectedState = cookies[COOKIE_STATE];

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return {
      statusCode: 400,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'set-cookie': clearCookie(COOKIE_STATE)
      },
      body: 'OAuth state mismatch. Please try connecting again.'
    };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const host = event.headers.host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/.netlify/functions/google-callback`;

  if (!clientId || !clientSecret || !host) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: 'Missing OAuth environment variables or host header.'
    };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Token exchange failed', details: tokenData })
    };
  }

  if (!tokenData.refresh_token) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'No refresh token received. Re-consent with prompt=consent and verify app is in testing/production properly.'
      })
    };
  }

  const encrypted = encryptRefreshToken(tokenData.refresh_token);

  return {
    statusCode: 302,
    headers: {
      location: '/connect.html?google=connected'
    },
    multiValueHeaders: {
      'set-cookie': [
        makeCookie(COOKIE_REFRESH, encrypted, 60 * 60 * 24 * 30),
        clearCookie(COOKIE_STATE)
      ]
    },
    body: ''
  };
};

