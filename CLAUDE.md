# CRM Project Memory

## Arbeitsweise
- Keine Rückfragen bei Tool-Nutzung (keine Permission-Prompts erwünscht)
- `/tmp/`-Dateien nicht zur Ansicht anbieten

## Deploy
- Nutzt gemeinsame `../deploy-lib.sh` (siehe Root-CLAUDE.md)
- Scripts: `push.sh`, `deploy.sh`, `push+deploy.sh`
- Git Repo: justintoenjes/t-njescrm (HTTPS)
- CI: GitHub Actions (`ci.yml`) — Lint + Typecheck + Vitest
- Besonderheit: App läuft als User `microcrm` → sudo-Wrapper für build/restart
- Services: microcrm-app, microcrm-callmonitor, microcrm-proxy
- Synct zusätzlich: nginx.conf, certs, callmonitor

## Server
- **Host:** microcrm (192.168.178.162) — SSH via VPN
- **SSH User:** jutoenje
- **SSH Key Passphrase:** Soomer9-6

## Application
- **App User:** microcrm (Anwendung läuft unter diesem User)
- **sudo NOPASSWD:** jutoenje kann ohne Passwort Befehle als microcrm ausführen
  - Regel: `jutoenje ALL=(microcrm) NOPASSWD: ALL`
  - Datei: `/etc/sudoers.d/jutoenje-microcrm`
- Befehle als microcrm ausführen: `sudo -u microcrm <befehl>`

## API Keys
- **GEMINI_API_KEY:** AIzaSyDEnSlE7m0MKJQy4ZXtjCu0ftPUglhGUJQ (Gemini 1.5 Flash)

## Tech-Stack (MicroCRM)
- **Container:** Podman + docker-compose.yml (openSUSE MicroOS)
- **Services:** db (postgres:alpine), app (Next.js 14), proxy (nginx:alpine, Port 80)
- **ORM:** Prisma mit PostgreSQL
- **Frontend:** Next.js 14 App Router, Tailwind CSS, Lucide Icons
- **Auth:** NextAuth v4 mit CredentialsProvider + bcryptjs, JWT-Sessions
- **RBAC:** ADMIN (alles) / USER (nur eigene Leads)
- **Projektpfad:** /Users/jutoenje/CRM/
  - App-Code: /Users/jutoenje/CRM/app/
  - DB-Daten: /Users/jutoenje/CRM/db-data/ (SELinux :Z Label)

## Datenmodell
- **User:** id, name, email (unique), password (bcrypt), role (ADMIN/USER), createdAt
- **Lead:** id, name, company, email, status (NEU/KONTAKTIERT/WARTEND/ABGESCHLOSSEN), lastContactedAt, createdAt, assignedToId → User (nullable)
- **Note:** id, content, createdAt, leadId → Lead (Cascade), authorId → User (nullable)
- **GlobalConfig:** key (PK), value — enthält `days_warm` (default 14) und `days_cold` (default 30)

## Temperatur-Logik
- hot: daysSinceContact < days_warm
- warm: days_warm ≤ daysSinceContact ≤ days_cold
- cold: daysSinceContact > days_cold
- Notiz speichern → setzt lastContactedAt auf NOW()
