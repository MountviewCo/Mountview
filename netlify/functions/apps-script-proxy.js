'use strict';

exports.handler = async function handler(event) {
  const target = process.env.APPS_SCRIPT_EXEC_URL;
  if (!target) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Missing APPS_SCRIPT_EXEC_URL env var' })
    };
  }

  try {
    const url = new URL(target);
    const query = event.rawQuery || '';
    if (query) {
      const incoming = new URLSearchParams(query);
      incoming.forEach((value, key) => {
        url.searchParams.append(key, value);
      });
    }

    const method = event.httpMethod || 'GET';
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'application/x-www-form-urlencoded;charset=UTF-8';

    const upstream = await fetch(url.toString(), {
      method,
      headers: method === 'GET' ? {} : { 'content-type': contentType },
      body: method === 'GET' ? undefined : (event.body || '')
    });

    const text = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      },
      body: text
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy request failed', details: error.message })
    };
  }
};

