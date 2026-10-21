# Deploying to the VPS

The Hetzner VPS (Ubuntu 26.04, `135.181.93.156`) also runs other apps, so Wechiau keeps to its own user, folders, database and Caddy site block. Nothing is compiled on the VPS: releases are built on the laptop and copied over.

| | |
|---|---|
| Address | `https://wechiau.135.181.93.156.nip.io`: the dashboard, with the API at `/api` |
| API | `wechiau-api` systemd service on `127.0.0.1:3100`, with Caddy in front |
| Code | `/opt/wechiau/releases/<name>`; `/opt/wechiau/current` points to the running one |
| Settings | `/etc/wechiau/wechiau.env` (database password; root and the service only) |
| Database | `wechiau_prod` on the server's PostgreSQL, login `wechiau` |
| Uploaded photos | `/var/lib/wechiau/uploads` |
| Backups | `/var/backups/wechiau`, nightly at 02:30, kept 14 days |

## First time

On the laptop, from `wechiau-platform`:

```bash
npm run release
```

It prints the archive's name, for example `release/wechiau-20261020-1335.tar.gz`. Copy it over (it asks for the `safo` password):

```bash
scp release/wechiau-20261020-1335.tar.gz safo@135.181.93.156:~/
```

On the VPS (`ssh safo@135.181.93.156`):

```bash
tar -xzf wechiau-20261020-1335.tar.gz
sudo bash wechiau-20261020-1335/infra/deploy/setup-vps.sh wechiau.135.181.93.156.nip.io
sudo bash wechiau-20261020-1335/infra/deploy/deploy.sh
sudo bash /opt/wechiau/current/infra/deploy/admin-account.sh --name "Gloria Gyimaa" --phone 024XXXXXXX --email gloria@example.com
```

The last command creates Gloria's admin account and asks for her password: at least 12 characters, not shown as it's typed. She then signs in to the dashboard with that email and password, and to the field app with that phone number and password. She adds everyone else from the dashboard, under Settings › People and access.

## Each new version

```bash
npm run release
scp release/wechiau-<new>.tar.gz safo@135.181.93.156:~/
```

Then on the VPS:

```bash
tar -xzf wechiau-<new>.tar.gz
sudo bash wechiau-<new>/infra/deploy/deploy.sh
```

`deploy.sh` backs up the database, applies database changes, switches over, and checks that the new version answers. If it doesn't, it goes back to the previous release by itself. The current and previous releases are kept.

## Day to day

| To… | Run on the VPS |
|---|---|
| See whether it's running | `systemctl status wechiau-api` |
| Read the API's log | `journalctl -u wechiau-api -n 100` (add `-f` to follow) |
| Restart it | `sudo systemctl restart wechiau-api` |
| Go back to the previous release | `sudo ln -sfn /opt/wechiau/releases/<previous> /opt/wechiau/current && sudo systemctl restart wechiau-api` |
| Back up now | `sudo systemctl start wechiau-backup` |
| Reset Gloria's password | `sudo bash /opt/wechiau/current/infra/deploy/admin-account.sh --email gloria@example.com` |

## Backups

The nightly backup is on the same disk as everything else, so if the VPS is lost, the backups go with it. Until there's somewhere else to send them (for example a Hetzner Storage Box), copy them to the laptop now and then:

```bash
scp "safo@135.181.93.156:/var/backups/wechiau/db-*.dump" .
```

That needs read access: `sudo usermod -aG wechiau safo` on the VPS, then sign in again.

To restore a database copy into an empty `wechiau_prod`:

```bash
sudo -u postgres pg_restore --no-owner --role=wechiau -d wechiau_prod /var/backups/wechiau/db-YYYYMMDD-HHMMSS.dump
```

## Moving to a real domain

1. Point the domain's A record at `135.181.93.156`.
2. Run `setup-vps.sh` again with the new name. It replaces the Wechiau block in the Caddyfile.
3. Change `EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json`, then build the phone apps again and reinstall them. Installed apps keep the address they were built with.
