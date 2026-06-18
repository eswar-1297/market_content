# Deployment Guide — CloudFuze Content Agent

Hand-off guide for deploying on a server with a custom domain.

## Stack
- **Node.js 20** (LTS). The app uses `better-sqlite3` (a native module), so a
  C/C++ toolchain is needed at install time.
- **Backend:** Express API (`server/`) on a single port.
- **Frontend:** React + Vite, built to `client/dist` and served by the Express
  server in production — so there is **one process** to run, not two.
- **Database:** SQLite files (no external DB server required).

## 1. Prerequisites (Ubuntu/Debian example)
```bash
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Build tools for better-sqlite3 native compilation
sudo apt-get install -y build-essential python3 git sqlite3
```

## 2. Get the code & install
```bash
git clone <REPO_URL> /opt/cloudfuze-content
cd /opt/cloudfuze-content
npm install            # installs root + client deps and compiles better-sqlite3
```

## 3. Configure environment
```bash
cp server/.env.example server/.env
# Edit server/.env and fill in the keys you use (at minimum one AI key:
# OPENAI_API_KEY or GEMINI_API_KEY). See server/.env.example for the full list.
```

**Two settings that matter most for this deployment:**
| Var | What to set |
|---|---|
| `PORT` | Port the app listens on (e.g. `3001`). The reverse proxy points here. |
| `DATA_DIR` | **Absolute path to a durable directory OUTSIDE the repo**, e.g. `/var/lib/cloudfuze-content`. This is where all writer history/personalization is stored — keeping it outside the clone means redeploys never wipe it. |

```bash
sudo mkdir -p /var/lib/cloudfuze-content
sudo chown $USER:$USER /var/lib/cloudfuze-content
# then set DATA_DIR=/var/lib/cloudfuze-content in server/.env
```

## 4. Build & run
```bash
npm run build          # builds the client into client/dist
npm start              # = node server/index.js  (serves API + built UI on $PORT)
```
Verify locally: `curl http://localhost:3001` should return HTML.

## 5. Keep it running (systemd)
`/etc/systemd/system/cloudfuze-content.service`:
```ini
[Unit]
Description=CloudFuze Content Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/cloudfuze-content
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# (env is also read from server/.env automatically)
User=www-data

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudfuze-content
sudo systemctl status cloudfuze-content
```
> Alternative: `pm2 start "npm start" --name cloudfuze-content && pm2 save && pm2 startup`.

## 6. Domain + HTTPS (Caddy — simplest, auto-TLS)
Point the domain's DNS **A record** to the server's public IP first. Then:

`/etc/caddy/Caddyfile`:
```
yourdomain.com {
    reverse_proxy localhost:3001
}
```
```bash
sudo systemctl reload caddy
```
Caddy obtains and renews the HTTPS certificate automatically.

<details><summary>nginx + certbot alternative</summary>

```nginx
server {
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Then `sudo certbot --nginx -d yourdomain.com`.
</details>

## 7. Back up the data (important — this is the real writer history)
The DB uses WAL mode, so copy it with the sqlite3 `.backup` command (consistent),
not a plain `cp`. Daily cron example:
```bash
# /etc/cron.daily/cloudfuze-backup  (chmod +x)
#!/bin/sh
DEST=/var/backups/cloudfuze
mkdir -p "$DEST"
sqlite3 /var/lib/cloudfuze-content/copilot.db ".backup '$DEST/copilot-$(date +%F).db'"
find "$DEST" -name 'copilot-*.db' -mtime +30 -delete
```

## 8. Redeploying a new version
```bash
cd /opt/cloudfuze-content
git pull
npm install            # rebuilds better-sqlite3 if Node changed
npm run build
sudo systemctl restart cloudfuze-content
```
Because `DATA_DIR` lives outside the repo, **all writer history/personalization
survives the redeploy.**

## What's stored in DATA_DIR
| File | Contents |
|---|---|
| `copilot.db` | Writers, writer profiles, sessions, chat history, content snapshots, article memory, feedback |
| `email.db` | Email campaign data |
| `bookmarks.json` | Thread Finder bookmarks |
| `learned-rules.json` | Feedback-learned agent rules |
| `articles-cache.json` | Cached content calendar (regenerable) |

## Notes
- **Node version changes** require `npm rebuild better-sqlite3` (native module).
- No external database service is needed — SQLite on a persistent disk is the design.
- Migration Docs product data comes from the public `CFTOOLS_DOCS_URL`
  (`https://doc.cftools.live`); no credentials required.
