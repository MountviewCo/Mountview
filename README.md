# Mountview

## Required flow

1. User opens `info.html` and signs in with Google.
2. If user is not in a company yet, they can:
   - create a company (becomes head approver), or
   - open an invite link and join that company.
3. Role routing:
   - approver -> `accept.html`
   - requester -> `request.html`
4. Approvers accept/deny requests.
5. Approvers open `history.html` for budget impact from decisions.
6. Invite link is visible and copyable from `accept.html`.

## Netlify environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64 for 32 random bytes)

## Frontend config

Edit `config.js`:

- `googleSheetsEndpoint`: your Apps Script web app `/exec` URL
- `registrySpreadsheetId`: your registry sheet ID
- `spreadsheetId`: optional fallback request sheet ID (normal flow uses company assignment)

## Apps Script

Deploy latest `Code.gs` web app version and use that `/exec` URL in `config.js`.
Registry workbook should contain (or allow auto-create) sheets:
- `Companies` (companyName, headEmail, inviteLink, companySpreadsheetId)
- `CompanyMembers` (email, role, companyId)
