# Secrets rotation reminder

If `.env` has ever been shared, copied off-machine, pasted into chat, or
committed to a non-private remote — rotate the keys below. Checklist only:
do **not** paste actual secret values here.

## Rotate

- **`GEMINI_API_KEY`** (live; required by `/api/extract`).
  Console: https://aistudio.google.com/app/apikey. Revoke the old key after
  the new one is in `.env` and the server has been restarted.

- **`OPENAI_API_KEY`** (orphan from a reverted experiment). May still sit in
  a historical `.env` or shell history. Revoke at
  https://platform.openai.com/api-keys.

- **`SMTP_USER` / `SMTP_PASS`** (optional — Gmail SMTP for `/api/email`). If
  `SMTP_PASS` is a Google App Password, revoke at
  https://myaccount.google.com/apppasswords.

- **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`**
  (optional — Drive via `/api/save-drive`). Rotate the OAuth client secret
  in Google Cloud Console, then re-mint the refresh token via
  `npm run bootstrap-drive` (see `scripts/bootstrap-drive.js`).

## Process

1. Mint new credentials at the consoles above.
2. Update `.env` (gitignored — never commit it).
3. Restart `npm run dev`. 4. Revoke the old credentials.
