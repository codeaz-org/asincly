# Slack

Asincly can post each team's daily digest to a Slack channel and remind people by DM when their check-in window opens.

- **Hosted cloud:** part of Pro.
- **Self-hosted:** always available once you create your own Slack app (about five minutes).

## What it does

| Event | In Slack |
|---|---|
| A check-in window opens for someone who hasn't checked in | DM from the Asincly bot with a **Check in** button (if "Remind people by DM" is on) |
| The digest is ready (everyone checked in, or every window closed) | A message in the chosen channel: how many checked in, open blockers, and up to three plan items per person |

- **Finding people:** Asincly matches them by email address (`users.lookupByEmail`), so their Slack email must match the one they sign in with.
- **Guests:** they get no reminders.
- **What we store:** the bot token, encrypted with `DATA_ENCRYPTION_KEY` in `slack_install`.
- **Logs:** a failure records only Slack's error code, never message text.
- **Uninstall:** if the app is removed from the workspace, the connection is dropped automatically.

## 1. Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Pick your workspace and paste this manifest. Replace `https://asincly.example.com` with your `NEXT_PUBLIC_APP_URL`.

```yaml
display_information:
  name: Asincly
  description: Async standups. Daily digests and check-in reminders.
  background_color: "#1a1410"
features:
  bot_user:
    display_name: Asincly
    always_online: false
oauth_config:
  redirect_urls:
    - https://asincly.example.com/api/slack/callback
  scopes:
    bot:
      - chat:write
      - channels:read
      - channels:join
      - groups:read
      - users:read
      - users:read.email
      - im:write
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

3. Open **Basic Information → App Credentials** and copy the **Client ID** and **Client Secret**.
4. To let other workspaces install it (hosted cloud), turn on **Manage Distribution**. A self-hosted app used by one workspace doesn't need this.

## 2. Configure Asincly

```bash
SLACK_CLIENT_ID=1234567890.1234567890
SLACK_CLIENT_SECRET=...
```

- `AUTH_SECRET` (already required) signs the OAuth `state`.
- `DATA_ENCRYPTION_KEY` (already required) encrypts the token.
- Restart the app afterwards.

## 3. Connect a team

1. As a team owner or admin, open **Settings → Integrations → Add to Slack** and approve.
2. Pick the digest channel.
   - **Public channels:** the bot joins automatically.
   - **Private channels:** run `/invite @Asincly` in the channel first.
3. Choose digest and/or DM reminders, then **Send a test**.

Slack messages go out from the same cron tick as in-app reminders (`/api/cron/tick`), so the tick must be scheduled. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Slack isn't set up on this server" | `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` missing |
| `redirect_uri did not match` on Slack | The manifest's redirect URL must be exactly `NEXT_PUBLIC_APP_URL` + `/api/slack/callback` |
| Private channel missing from the list | `/invite @Asincly` in that channel, then reload the page |
| Someone gets no DM | Their Slack email differs from their Asincly email, they're a guest, or they already checked in |
