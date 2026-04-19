# MCP Connector Dashboard — How to Run

A local web dashboard for configuring Zoom and Outlook MCP credentials without editing `.env` files.

---

## Prerequisites

- [Node.js](https://nodejs.org) v18 or higher

No `npm install` required — the server uses only Node.js built-in modules.

---

## First-Time Setup

### 1. Start the server

```
npm start
```

You should see:

```
MCP Connector Dashboard running at http://localhost:4000
```

### 3. Open the dashboard

Open your browser and go to:

```
http://localhost:4000
```

---

## Using the Dashboard

### Zoom (Server-to-Server OAuth 2.0)

1. Expand **"How to find your Zoom credentials"** for step-by-step instructions.
2. Enter your **Account ID**, **Client ID**, and **Client Secret** from the [Zoom Marketplace](https://marketplace.zoom.us).
3. Click **Save**.
4. Click **Test Connection** — a live token request is made to Zoom's OAuth endpoint to confirm the credentials work.

### Outlook (Microsoft Graph API)

1. Expand **"How to find your Outlook credentials"** for step-by-step Azure Portal instructions.
2. Enter your **Application (Client) ID**, **Client Secret Value**, and **Directory (Tenant) ID**.
   > **Important:** Copy the secret **Value**, not the Secret ID. Using the wrong field causes error `AADSTS7000215`.
3. Click **Save**.
4. Click **Test Connection** — validates the GUID format of your IDs and confirms all fields are filled.
5. To complete Outlook authentication, run the auth server in your `outlook-mcp` directory:
   ```
   npm run auth-server
   ```
   Then use the `authenticate` tool in Claude to complete the OAuth browser flow.

---

## Credential Storage

Credentials are saved to:

```
~/.mcp-connector/credentials.json
```

- File permissions are set to `0600` (owner read/write only).
- Secrets are **masked** in the UI (only the last 4 characters are shown after saving).
- This file is never stored in the project directory or committed to git.

---

## Stopping the Server

Press `Ctrl + C` in the terminal where the server is running.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 4000 already in use | Set a different port: `PORT=5000 npm start` |
| Zoom test returns auth error | Double-check your Client ID and Secret from the Zoom Marketplace App Credentials tab |
| Outlook test returns invalid GUID | Ensure you copied the full ID in `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` format |
| Outlook `AADSTS7000215` error | You copied the Secret **ID** instead of the Secret **Value** — go back to Azure Portal and copy from the Value column |
