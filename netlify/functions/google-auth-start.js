'use strict';

const crypto = require('crypto');

const COOKIE_STATE = 'mv_google_oauth_state';

function makeCookie(name, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

exports.handler = async function handler(event) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const host = event.headers.host;
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/.netlify/functions/google-callback`;

  if (!clientId || !host) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Missing GOOGLE_CLIENT_ID or host header.' })
    };
  }

  const state = crypto.randomBytes(24).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.file',
    state
  });

  return {
    statusCode: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      'set-cookie': makeCookie(COOKIE_STATE, state, 600)
    },
    body: ''
  };
};
