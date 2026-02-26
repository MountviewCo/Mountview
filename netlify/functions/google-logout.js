'use strict';

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

exports.handler = async function handler() {
  return {
    statusCode: 302,
    headers: { location: '/info.html?logout=1' },
    multiValueHeaders: {
      'set-cookie': [
        clearCookie('mv_google_oauth_state'),
        clearCookie('mv_google_refresh_token'),
        clearCookie('mv_google_email'),
        clearCookie('mv_google_role'),
        clearCookie('mv_google_sheet_id')
      ]
    },
    body: ''
  };
};
