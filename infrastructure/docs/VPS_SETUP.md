# Kwanix — VPS Deployment Setup Guide

This guide covers the one-time setup required to deploy Kwanix on a Hostinger VPS alongside existing services (Odoo, Voxbridge). Run these steps in order.

---

## Prerequisites

- Root or sudo access to the VPS
- `kwanix.com` registered on Cloudflare Registrar ✓ (DNS is already managed by Cloudflare — no nameserver changes needed)
- The repository cloned or accessible from GitHub
- Docker and Docker Compose v2 installed on the VPS

---

## Phase 1 — Cloudflare

### 1.1 DNS Records

Since `kwanix.com` is registered on Cloudflare, DNS is already managed there. Go to **Cloudflare Dashboard → kwanix.com → DNS → Records** and add four **A records** pointing to your VPS IP. Set all four to **Proxied** (orange cloud — this routes traffic through Cloudflare and hides your VPS IP).

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `app` | `<your VPS IP>` | Proxied ☁️ |
| A | `api` | `<your VPS IP>` | Proxied ☁️ |
| A | `staging` | `<your VPS IP>` | Proxied ☁️ |
| A | `api.staging` | `<your VPS IP>` | Proxied ☁️ |

> To find your VPS IP: log into Hostinger hPanel → VPS → your server → the IP is shown at the top.

### 1.2 SSL/TLS Mode

Go to **SSL/TLS → Overview** and set the encryption mode to **Full (Strict)**.

> ⚠️ Do not use "Flexible" — it sends unencrypted traffic between Cloudflare and your server.

### 1.3 Origin Certificate

Go to **SSL/TLS → Origin Server → Create Certificate**.

- **Hostnames:** `*.kwanix.com`, `kwanix.com`
- **Validity:** 15 years
- **Key type:** RSA (2048)

Click **Create** and download both files:
- `kwanix-origin.pem` → this is your certificate
- `kwanix-origin.key` → this is your private key

Keep these files safe. You will upload them to the VPS in Phase 2.

---

## Phase 2 — VPS: SSL Certificate

SSH into your VPS and create the certificate directory:

```bash
sudo mkdir -p /etc/ssl/kwanix
sudo chmod 700 /etc/ssl/kwanix
```

From your **local machine**, upload the Cloudflare Origin Certificate files:

```bash
scp kwanix-origin.pem root@<your-vps-ip>:/etc/ssl/kwanix/origin.crt
scp kwanix-origin.key root@<your-vps-ip>:/etc/ssl/kwanix/origin.key
```

Back on the VPS, set correct permissions:

```bash
sudo chmod 644 /etc/ssl/kwanix/origin.crt
sudo chmod 600 /etc/ssl/kwanix/origin.key
```

---

## Phase 3 — VPS: Clone the Repository

```bash
sudo mkdir -p /opt/kwanix
sudo chown $USER:$USER /opt/kwanix

git clone git@github.com:Justoo1/kwanix.git /opt/kwanix
cd /opt/kwanix
```

> If using HTTPS instead of SSH:
> ```bash
> git clone https://github.com/Justoo1/kwanix.git /opt/kwanix
> ```

---

## Phase 4 — VPS: Environment Files

Create environment files from the example template:

```bash
cd /opt/kwanix
cp .env.example .env.staging
cp .env.example .env.production
```

### Edit `.env.staging`

```bash
nano .env.staging
```

Fill in every `CHANGE_ME` value. Key fields:

| Variable | What to set |
|---|---|
| `POSTGRES_USER` | `kwanix` |
| `POSTGRES_PASSWORD` | A strong random password |
| `POSTGRES_DB` | `kwanix_db` |
| `DATABASE_URL` | `postgresql+asyncpg://kwanix_app:<APP_ROLE_PASSWORD>@postgres:5432/kwanix_db` |
| `DATABASE_ADMIN_URL` | `postgresql+asyncpg://kwanix:<POSTGRES_PASSWORD>@postgres:5432/kwanix_db` |
| `APP_ROLE_PASSWORD` | A strong random password (generate with `openssl rand -hex 24`) |
| `JWT_SECRET_KEY` | At least 32 characters (generate with `openssl rand -hex 32`) |
| `SESSION_SECRET` | At least 32 characters (generate with `openssl rand -hex 32`) |
| `REDIS_PASSWORD` | A strong random password |
| `NEXT_PUBLIC_API_URL` | `https://staging-api.kwanix.com` |
| `NEXT_PUBLIC_APP_URL` | `https://staging.kwanix.com` |
| `API_INTERNAL_URL` | `http://api:8000` |
| `ALLOWED_ORIGINS` | `https://staging.kwanix.com` |
| `PAYSTACK_SECRET_KEY` | Your Paystack **test** key (`sk_test_...`) |
| `PAYSTACK_PUBLIC_KEY` | Your Paystack **test** key (`pk_test_...`) |
| `ARKESEL_API_KEY` | Your Arkesel API key |
| `ENVIRONMENT` | `staging` |
| `DEBUG` | `false` |

### Edit `.env.production`

```bash
nano .env.production
```

Same fields as staging, with these differences:

| Variable | What to set |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.kwanix.com` |
| `NEXT_PUBLIC_APP_URL` | `https://kwanix.com` |
| `ALLOWED_ORIGINS` | `https://kwanix.com` |
| `PAYSTACK_SECRET_KEY` | Your Paystack **live** key (`sk_live_...`) |
| `PAYSTACK_PUBLIC_KEY` | Your Paystack **live** key (`pk_live_...`) |
| `ENVIRONMENT` | `production` |
| `SENTRY_DSN` | Your Sentry API project DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Your Sentry web project DSN |

> 🔒 Never commit either `.env.staging` or `.env.production` to git. They are listed in `.gitignore`.

---

## Phase 5 — VPS: Nginx Virtual Hosts

Install the Kwanix nginx virtual host configs and reload nginx:

```bash
cd /opt/kwanix

# Staging vhosts
sudo cp infrastructure/nginx/kwanix-staging.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/kwanix-staging.conf /etc/nginx/sites-enabled/

# Production vhosts
sudo cp infrastructure/nginx/kwanix-prod.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/kwanix-prod.conf /etc/nginx/sites-enabled/

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` reports an error, check that your SSL cert files exist at `/etc/ssl/kwanix/origin.crt` and `/etc/ssl/kwanix/origin.key`.

---

## Phase 6 — First Deploy

Run the deploy script for staging first, verify it works, then deploy production.

```bash
cd /opt/kwanix

# Deploy staging (runs migrations automatically)
bash infrastructure/scripts/deploy.sh staging

# Verify staging is healthy
curl -sf https://staging-api.kwanix.com/health
# Expected: {"status":"ok","version":"1.0.0"}

# Deploy production
bash infrastructure/scripts/deploy.sh production

# Verify production is healthy
curl -sf https://api.kwanix.com/health
```

The deploy script automatically:
1. Pulls latest code from the branch
2. Builds Docker images
3. Starts services with `docker compose up -d`
4. Runs Alembic migrations via the API container's entrypoint
5. Polls the `/health` endpoint until the API is ready

---

## Phase 7 — GitHub Actions CD

### 7.1 Repository Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `VPS_HOST` | Your VPS IP address |
| `VPS_USER` | Your SSH username (usually `root` on Hostinger) |
| `VPS_SSH_KEY` | Your **private** SSH key (the full content of `~/.ssh/id_rsa` or equivalent) |

### 7.2 Production Environment Gate

1. Go to **Settings → Environments → New environment**
2. Name it exactly `production`
3. Under **Required reviewers**, add yourself
4. Save

This means every push to `master` will pause and wait for your approval before deploying to production.

### 7.3 How CD works

| Git event | What happens |
|---|---|
| Push to `develop` | Automatically deploys to staging |
| Push to `master` | Waits for manual approval, then deploys to production |

---

## Ongoing Operations

### Deploy manually

```bash
cd /opt/kwanix
bash infrastructure/scripts/deploy.sh staging     # or production
```

### View logs

```bash
cd /opt/kwanix
make staging-logs    # staging
make prod-logs       # production
```

### Run a migration manually

```bash
make staging-migrate
make prod-migrate
```

### Update nginx config after a change

```bash
cd /opt/kwanix
make nginx-staging   # re-copies and reloads
make nginx-prod
```

---

## Port Reference

| Service | Host port | Environment |
|---|---|---|
| Kwanix web | `127.0.0.1:3100` | Production |
| Kwanix API | `127.0.0.1:8100` | Production |
| Kwanix web | `127.0.0.1:3101` | Staging |
| Kwanix API | `127.0.0.1:8101` | Staging |
| Voxbridge web | `127.0.0.1:3000` | — |
| Voxbridge API | `127.0.0.1:8081` | — |

All ports are bound to `127.0.0.1` (localhost only). Nginx is the only process that accepts external traffic on ports 80 and 443.
