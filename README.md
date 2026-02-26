# Mountview
A great mount for a view

## Google OAuth + delayed sheet creation setup

1. In Google Cloud Console, create OAuth client type `Web application`.
2. Authorized redirect URI must include:
   - `https://YOUR-SITE.netlify.app/.netlify/functions/google-callback`
3. In Netlify Site settings -> Environment variables, add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64 for 32 random bytes)

Generate key in PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## Endpoints added

- `/.netlify/functions/google-auth-start`
  - Starts Google OAuth connect flow.
- `/.netlify/functions/google-callback`
  - Exchanges auth code and stores encrypted refresh token in HttpOnly cookie.
- `/.netlify/functions/copy-template-later`
  - Uses stored refresh token to create a Google Sheet on first call, then reuses that same sheet on later calls.
  - Accepts JSON body:
    - `companyName` (string, optional)
  - Returns `fileId`, `name`, `webViewLink`.
  - Sheet names are enforced as: `Company Name - Mountview` (fallback: `User Company Name - Mountview`).

## Test page

Open `/connect.html` and use:
- Connect Google Account
- Create Google Sheet Now

## Apps Script target file selection

Set these in `config.js` for your website pages:
- `spreadsheetId` (preferred if known).

Your frontend sends `spreadsheetId` to `Code.gs` on create/list/update actions.

For production, replace cookie-based token storage with database storage per user account.

Note: current function code computes redirect URI from the request host, so `GOOGLE_REDIRECT_URI` is no longer required.
