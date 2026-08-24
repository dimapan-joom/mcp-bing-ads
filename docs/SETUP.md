# Bing Ads MCP — Setup Guide

This guide explains how to get API access to Microsoft Advertising (Bing Ads) and configure the MCP server for use with Claude Code.

---

## Overview

To use this MCP you need three things:
1. **Developer Token** — identifies your app to the Microsoft Advertising API
2. **OAuth2 App credentials** — Client ID + Secret from Azure portal
3. **Refresh Token** — long-lived token representing your ad account user

---

## Step 1 — Get a Developer Token

The Developer Token is tied to your Microsoft Advertising manager account.

1. Log in to [Microsoft Advertising](https://ads.microsoft.com)
2. Go to **Tools → API Center** (top navigation)
3. Under **Developer token**, click **Request token** if you don't have one yet
4. Copy the token — a short alphanumeric string. Do not paste it into this repository, or any file you commit: it belongs in an environment variable or a secret store. A developer token grants no account access on its own, but it is still ours, and a leaked one gets our API access throttled or revoked.

> 📸 _Screenshot: Tools → API Center page showing the developer token_

**Access levels:**
- `Basic` — Sandbox only (testing)
- `Standard` — Production access, limited QPS
- `Full` — Production, higher QPS (requires application)

For most use cases, Standard is sufficient.

---

## Step 2 — Register an OAuth2 App in Azure

Microsoft Advertising uses Azure AD for OAuth. You need to register an app to get a Client ID and Client Secret.

1. Go to [Azure Portal](https://portal.azure.com) → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Fill in:
   - **Name**: `Joom Bing Ads MCP` (or any name)
   - **Supported account types**: `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI**: `https://login.microsoftonline.com/common/oauth2/nativeclient` (type: Web)
4. Click **Register**

> 📸 _Screenshot: Azure App Registration form_

5. On the app page, copy the **Application (client) ID** — this is your `client_id`

> 📸 _Screenshot: App overview showing Application ID_

6. Go to **Certificates & secrets** → **New client secret**
   - Description: `bing-ads-mcp`
   - Expiry: 24 months (or as needed)
   - Copy the **Value** immediately — this is your `client_secret` (shown only once!)

> 📸 _Screenshot: Client secrets page with new secret_

7. Go to **API permissions** → **Add a permission** → **APIs my organization uses** → search for `Microsoft Advertising` → add `msads.manage` scope

> 📸 _Screenshot: API permissions with msads.manage added_

---

## Step 3 — Get a Refresh Token

The refresh token authorises the MCP to act on behalf of your Microsoft Advertising account.

Run the token helper script included in the repo:

```bash
cd ~/mcp-bing-ads
node get-refresh-token.cjs
```

It will:
1. Open a browser to Microsoft login
2. Ask you to sign in with your `dimapan@joom.com` account
3. Show a code you paste into the terminal
4. Print a `refresh_token` to copy

> 📸 _Screenshot: Terminal output showing the refresh token_

Store it securely in macOS Keychain (the MCP reads it from there automatically):

```bash
security add-generic-password \
  -a "bing-ads-mcp" \
  -s "BING_ADS_REFRESH_TOKEN" \
  -w "YOUR_REFRESH_TOKEN" \
  -U
```

> ⚠️ Refresh tokens expire if unused for 90 days. Re-run `get-refresh-token.cjs` to renew.

---

## Step 4 — Configure `config.json`

Copy the example config and fill in your values:

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "oauth": {
    "client_id": "bcc26d3a-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    "scope": "https://ads.microsoft.com/msads.manage offline_access"
  },
  "clients": {
    "joom": {
      "customer_id": "252992655",
      "account_id": "138371118",
      "name": "SIA Joom",
      "folder": "/path/to/your/project"
    },
    "ayzeze": {
      "customer_id": "252992655",
      "account_id": "138977563",
      "name": "Ayzeze",
      "folder": "/path/to/ayzeze"
    }
  }
}
```

**Where to find your IDs:**
- `customer_id`: Microsoft Advertising UI → top right account dropdown → the number after `C`
- `account_id`: Microsoft Advertising UI → account selector → the number in parentheses

> 📸 _Screenshot: Microsoft Advertising UI showing customer ID and account ID_

> ⚠️ `config.json` is **not committed** to git (it's in `.gitignore`). Never commit credentials.  
> The `client_secret` is passed via env var `BING_ADS_CLIENT_SECRET`, not stored in `config.json`.

---

## Step 5 — Register the MCP with Claude Code

```bash
claude mcp add bing-ads -s user \
  -e BING_ADS_DEVELOPER_TOKEN=YOUR_DEVELOPER_TOKEN \
  -e BING_ADS_CLIENT_ID=YOUR_CLIENT_ID \
  -e BING_ADS_CLIENT_SECRET=YOUR_CLIENT_SECRET \
  -e BING_ADS_REFRESH_TOKEN=YOUR_REFRESH_TOKEN \
  -e BING_ADS_MCP_WRITE=true \
  -- npx --yes github:dimapan-joom/mcp-bing-ads
```

Verify it connected:

```bash
claude mcp list
# bing-ads: npx --yes github:dimapan-joom/mcp-bing-ads - ✓ Connected
```

---

## Account Structure

| Account | Customer ID | Account ID | Notes |
|---|---|---|---|
| SIA Joom | 252992655 | 138371118 | Main Joom account — Search, Shopping, PMax |
| Ayzeze | 252992655 | 138977563 | Ayzeze — Shopping only |

Both accounts share the same Customer ID (252992655) — they're under the same Microsoft Advertising manager account.

The `folder` field in `config.json` maps your working directory to the right account. When Claude Code is open in `/Users/dimapan/claude-code-project`, it automatically uses the `joom` account.

---

## Troubleshooting

**"Refresh token expired"**  
Re-run `node get-refresh-token.cjs` and update the Keychain entry.

**"Developer token invalid"**  
Check in Microsoft Advertising → Tools → API Center that the token is active.

**"Insufficient permissions"**  
Make sure `msads.manage` scope is added to the Azure app and the user re-authorised after adding it.

**Write operations not working**  
Ensure `BING_ADS_MCP_WRITE=true` is set in the MCP env config.

---

## Security Notes

- `config.json` and all credential files are gitignored
- Refresh tokens are stored in macOS Keychain, not in files
- Client secret is passed via environment variable only
- Write operations are disabled by default (`BING_ADS_MCP_WRITE=false`) — set to `true` only when needed
