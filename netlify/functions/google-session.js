'use strict';

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

exports.handler = async function handler(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
  const refresh = cookies.mv_google_refresh_token || '';
  const email = cookies.mv_google_email || '';

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      authenticated: Boolean(refresh),
      email
    })
  };
};
