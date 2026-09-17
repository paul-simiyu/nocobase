# Deploying to proj.simpauldesign.com

Everything needed to run the NocoBase app carrying
[`@nocobase/plugin-tender-radar`](../../packages/plugins/@nocobase/plugin-tender-radar)
at `https://proj.simpauldesign.com`.

| File                                | Purpose                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `.env.example`                      | Template for the app's environment. Copy to `.env` and fill in. |
| `docker-compose.yml`                | The app plus PostgreSQL 16.                                     |
| `nginx/proj.simpauldesign.com.conf` | TLS termination and reverse proxy.                              |

## First deploy

```bash
cd deploy/proj.simpauldesign.com
cp .env.example .env

# Generate the three secrets. Keep them: rotating APP_KEY logs everyone out,
# and rotating ENCRYPTION_FIELD_KEY makes existing encrypted values unreadable.
openssl rand -base64 32   # APP_KEY
openssl rand -base64 32   # ENCRYPTION_FIELD_KEY
openssl rand -base64 24   # DB_PASSWORD

docker compose up -d
docker compose exec app yarn nocobase upgrade     # creates the collections
docker compose exec app yarn pm enable @nocobase/plugin-tender-radar
```

Then install the web server config:

```bash
sudo cp nginx/proj.simpauldesign.com.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

## What is already handled

**The app is not publicly reachable except through nginx.** Compose publishes the
container on `127.0.0.1:13000` rather than the stock `13000:80`, which binds every
interface and would leave the app answering on `http://<public-ip>:13000`, bypassing
TLS entirely.

**WebSockets proxy correctly.** NocoBase pushes in-app notifications over a
WebSocket. Without `Upgrade` and `Connection` headers the app loads normally and then
silently never updates — a confusing thing to diagnose weeks later.

**TLS needs no special work.** `proj.simpauldesign.com` is three labels, so a wildcard
for `*.simpauldesign.com` covers it. The config points at the Let's Encrypt live path;
adjust if your certificate lives elsewhere. A four-label `www.proj.simpauldesign.com`
would _not_ be covered — serve any such name as an edge redirect, not a second origin.

**Long harvests do not 504.** A sweep across several portals can outlast nginx's 60s
default, so proxy read and send timeouts are raised to 300s.

## Two things to check on your host

**IPv6.** The config listens on both `0.0.0.0` and `[::]`. If the host has no IPv6,
nginx refuses to start with `Address family not supported by protocol` — delete the
two `listen [::]:...` lines.

**nginx version.** HTTP/2 is enabled on the `listen` line, which works from 1.9.5
onward. The newer `http2 on;` directive does not exist before 1.25.1 and would stop
1.24 — what Ubuntu 24.04 LTS ships — from starting. On 1.25.1+ the current form logs a
deprecation warning and still works.

## Verification status

`nginx -t` passes against this config on nginx 1.24.0, using a generated test
certificate. Two messages appear in that run and neither is a config defect: the
`ssl_stapling` warning comes from the self-signed test certificate having no issuer
chain, and the IPv6 socket error comes from the test container having no IPv6 in its
kernel — with the `[::]` lines removed the run reports `test is successful`.

The compose file parses as YAML. **Neither file has been run against a real host**, no
container has been started, and no certificate has been issued, so treat the first
deploy as the real test.

## The CRM token

`plugin-tender-radar` sends leads to a CRM using a token it resolves from the
environment **by name**. Put the token in `.env` as `TENDER_RADAR_CRM_TOKEN`, then set
the `crmTargets` row's `tokenVariable` column to the string
`TENDER_RADAR_CRM_TOKEN` — never the token itself. A dump of that table then carries
no secret.
