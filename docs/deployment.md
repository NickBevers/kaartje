# Deploying Kaartje to Hetzner

This guide covers deploying the full Kaartje stack (API, web, MinIO, LibSQL) to a Hetzner Cloud VPS using Docker Compose with Caddy as a reverse proxy (automatic HTTPS).

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Hetzner VPS                                    │
│                                                 │
│  ┌───────┐    ┌─────┐    ┌─────────┐            │
│  │ Caddy │───▶│ API │───▶│ LibSQL  │            │
│  │ :443  │    │:3000│    │  :8080  │            │
│  │       │    │(Bun)│───▶│         │            │
│  │       │    └─────┘    └─────────┘            │
│  │       │                                      │
│  │       │    ┌─────┐    ┌─────────┐            │
│  │       │───▶│ Web │    │  MinIO  │            │
│  │       │    │:4321│    │  :9000  │            │
│  │       │    │(Ast)│    │         │            │
│  │       │───────────────▶         │            │
│  └───────┘               └─────────┘            │
└─────────────────────────────────────────────────┘
```

- **Caddy** — reverse proxy, automatic Let's Encrypt TLS
- **API** — Bun HTTP server + WebSocket
- **Web** — Astro static site served by Caddy (or SSR via Node)
- **MinIO** — S3-compatible object storage for postcard images
- **LibSQL** — SQLite-compatible database (Turso)

All services communicate over a Docker network. Only Caddy exposes ports 80/443 to the internet.

---

## Prerequisites

- A Hetzner Cloud account
- A domain name with DNS access
- SSH key pair

---

## 1. Provision the server

### Create a VPS

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud)
2. Create a new project (or use an existing one)
3. Add a server:
   - **Location**: choose the closest to your users
   - **Image**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4 GB RAM) — sufficient for moderate traffic
   - **SSH key**: add your public key
   - **Name**: `kaartje`
4. Note the server's public IP address

### Point DNS

Create DNS records for your domain (e.g. `kaartje.example.com`):

| Type | Name               | Value           |
|------|--------------------|-----------------|
| A    | kaartje            | YOUR_SERVER_IP  |
| A    | storage.kaartje    | YOUR_SERVER_IP  |

The `storage` subdomain is for public MinIO access (postcard images). You can use a single domain with path-based routing instead — see the Caddyfile section.

---

## 2. Server setup

SSH into the server:

```bash
ssh root@YOUR_SERVER_IP
```

### Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

### Create a deploy user (recommended)

```bash
adduser deploy
usermod -aG docker deploy
su - deploy
```

### Clone the repository

```bash
git clone https://github.com/YOUR_ORG/kaartje.git /opt/kaartje
cd /opt/kaartje
```

---

## 3. Production files

You need to create three files in the repository root:

### `Dockerfile.api`

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root + relevant package.json files
COPY package*.json ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/

# Install dependencies
RUN npm install --workspace=@kaartje/api --workspace=@kaartje/shared

# Copy source code
COPY packages/api packages/api
COPY packages/shared packages/shared
COPY tsconfig.json ./

EXPOSE 3000
CMD ["bun", "run", "packages/api/src/index.ts"]
```

### `Dockerfile.web`

There are two options for the web frontend:

#### Option A: Static build (recommended, simplest)

Build with Astro's default static output, serve with Caddy. No runtime needed.

```dockerfile
FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspace=@kaartje/web --workspace=@kaartje/shared

COPY packages/web packages/web
COPY packages/shared packages/shared
COPY tsconfig.json ./

# Pass the public API URL at build time
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

RUN npm run build --workspace=@kaartje/web

# Serve static files with Caddy
FROM caddy:2
COPY --from=build /app/packages/web/dist /srv
EXPOSE 4321
CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":4321"]
```

#### Option B: SSR with Node adapter

If you need server-side rendering, install the Astro Node adapter first:

```bash
npm install @astrojs/node --workspace=@kaartje/web
```

Update `packages/web/astro.config.mjs`:

```js
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // ... rest of config
});
```

Then use this Dockerfile:

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
RUN npm install --workspace=@kaartje/web --workspace=@kaartje/shared
COPY packages/web packages/web
COPY packages/shared packages/shared
COPY tsconfig.json ./
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
RUN npm run build --workspace=@kaartje/web

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/packages/web/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/web/package.json ./
ENV HOST=0.0.0.0
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

### `docker-compose.prod.yml`

```yaml
services:
  caddy:
    image: caddy:2
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - api
      - web

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    restart: always
    environment:
      PORT: "3000"
      TURSO_DATABASE_URL: http://libsql:8080
      TURSO_AUTH_TOKEN: ""
      S3_ENDPOINT: http://minio:9000
      S3_PUBLIC_URL: https://storage.${DOMAIN}
      S3_BUCKET: kaartje-postcards
      S3_ACCESS_KEY_ID: ${MINIO_USER}
      S3_SECRET_ACCESS_KEY: ${MINIO_PASS}
    depends_on:
      - libsql
      - minio

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
      args:
        PUBLIC_API_URL: https://${DOMAIN}
    restart: always

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    restart: always
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASS}
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    restart: "no"
    entrypoint: >
      /bin/sh -c "
      sleep 3;
      mc alias set local http://minio:9000 $${MINIO_USER} $${MINIO_PASS};
      mc mb local/kaartje-postcards --ignore-existing;
      mc anonymous set download local/kaartje-postcards;
      echo 'Bucket ready';
      "

  libsql:
    image: ghcr.io/tursodatabase/libsql-server:latest
    restart: always
    volumes:
      - libsql-data:/var/lib/sqld

volumes:
  caddy-data:
  caddy-config:
  minio-data:
  libsql-data:
```

### `Caddyfile`

```
{$DOMAIN} {
    # API routes
    handle /ws {
        reverse_proxy api:3000
    }
    handle /postcards* {
        reverse_proxy api:3000
    }
    handle /uploads/* {
        reverse_proxy api:3000
    }
    handle /health {
        reverse_proxy api:3000
    }
    handle /dev/* {
        reverse_proxy api:3000
    }

    # Everything else → web frontend
    handle {
        reverse_proxy web:4321
    }
}

# Public image access via MinIO
storage.{$DOMAIN} {
    reverse_proxy minio:9000
}
```

### `.env.prod`

```env
DOMAIN=kaartje.example.com
MINIO_USER=kaartje-storage
MINIO_PASS=change-this-to-a-strong-password
```

> **Important**: never commit this file. Add `.env.prod` to `.gitignore`.

---

## 4. Update the API for production URLs

The API currently generates MinIO URLs using the internal `S3_ENDPOINT`. In production, images need to be served via the public `storage.` subdomain.

Update `packages/api/src/storage/s3.ts` — modify `getPublicUrl`:

```ts
export function getPublicUrl(key: string) {
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const publicUrl = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "http://localhost:9000";
  return `${publicUrl}/${bucket}/${key}`;
}
```

This uses `S3_PUBLIC_URL` (the Caddy-proxied URL) for image URLs returned to clients, while `S3_ENDPOINT` (internal Docker network) is used for upload/download operations.

---

## 5. Deploy

```bash
cd /opt/kaartje

# Create the production env file
cp .env.prod .env

# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Check logs
docker compose -f docker-compose.prod.yml logs -f

# Run database migrations
docker compose -f docker-compose.prod.yml exec api \
  bun run packages/api/src/db/migrate.ts

# Seed postcards (optional)
docker compose -f docker-compose.prod.yml exec api \
  bun packages/api/src/scripts/seed-postcards.ts
```

---

## 6. Verify

1. Visit `https://kaartje.example.com` — you should see the globe
2. Visit `https://storage.kaartje.example.com/kaartje-postcards/` — should list bucket contents
3. Check WebSocket: open browser devtools, look for WS connection to `/ws`

---

## Updating

To deploy changes:

```bash
cd /opt/kaartje
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

To rebuild a single service:

```bash
docker compose -f docker-compose.prod.yml up -d --build api
```

---

## Monitoring

### View logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
```

### Check service health

```bash
curl https://kaartje.example.com/health
# → {"status":"ok"}
```

### Database access

```bash
# Open Drizzle Studio (forwards port 4983 to your machine)
ssh -L 4983:localhost:4983 deploy@YOUR_SERVER_IP
docker compose -f docker-compose.prod.yml exec api bun run db:studio
# Then open https://local.drizzle.studio in your browser
```

---

## Backups

### Database

```bash
# Copy the LibSQL data volume
docker compose -f docker-compose.prod.yml exec libsql \
  sqlite3 /var/lib/sqld/data.db ".backup /tmp/backup.db"
docker compose -f docker-compose.prod.yml cp libsql:/tmp/backup.db ./backup.db
```

### MinIO (postcard images)

```bash
# Use mc (MinIO client) to mirror to a local directory
docker run --rm --network kaartje_default \
  -v $(pwd)/backup-images:/backup \
  minio/mc sh -c "
    mc alias set prod http://minio:9000 YOUR_USER YOUR_PASS;
    mc mirror prod/kaartje-postcards /backup;
  "
```

---

## Security checklist

- [ ] Strong MinIO credentials (not `minioadmin`)
- [ ] Firewall: only ports 80, 443, and 22 open (`ufw allow 80,443,22/tcp && ufw enable`)
- [ ] `.env.prod` is in `.gitignore`
- [ ] SSH key auth only (disable password auth in `/etc/ssh/sshd_config`)
- [ ] Set up unattended upgrades: `apt install unattended-upgrades`
- [ ] Consider adding rate limiting to Caddy for the API endpoints

---

## Cost estimate

| Resource      | Hetzner plan | Monthly cost |
|---------------|-------------|-------------|
| VPS (CX22)    | 2 vCPU, 4GB | ~€4.50      |
| Storage (20GB)| included    | €0          |
| Bandwidth     | 20TB included| €0         |
| Domain        | varies      | ~€10/year   |

Total: **~€5/month** for a fully self-hosted setup with auto-HTTPS.
