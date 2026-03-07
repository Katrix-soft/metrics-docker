# NexPulse by Katrix — Monitor Lite

> **Panel de control DevOps para infraestructura VPS + Docker + Portainer**  
> Stack: Angular 17 · NestJS 10 · Docker · Portainer · GitHub API

---

## ¿Qué es esto?

**NexPulse Monitor** es un dashboard operativo propio de Katrix-soft que permite:

- 📊 Monitorear CPU, RAM y disco del VPS en tiempo real
- 🐳 Ver y controlar contenedores Docker (start, stop, restart, hibernate, recursos)
- ⎇ Ver el estado de todos los repos de la organización GitHub
- 🚀 Hacer **deploy con un click** (git pull + Portainer webhook)
- 🔥 **Force Clean Redeploy** — baja contenedores viejos y relanza, sin SSH
- 🔔 **Toast notifications** con estado del deploy y URL del servicio desplegado
- 🤖 Bot de WhatsApp integrado para alertas y comandos remotos
- 🔐 Login con contraseña, 2FA (TOTP) y biometría (WebAuthn/FIDO2)

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                        VPS (katrix.com.ar)                      │
│                                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────────┐   │
│  │  metricas-backend   │    │     metricas-frontend        │   │
│  │  (NestJS / :3000)   │◄───│     (Angular → Nginx)        │   │
│  │                     │    │     Puerto :4205             │   │
│  │  • /api/system      │    └──────────────────────────────┘   │
│  │  • /api/docker      │                                        │
│  │  • /api/git/status  │    ┌──────────────────────────────┐   │
│  │  • /api/git/deploy  │    │         Portainer            │   │
│  │  • /api/git/force-  │───►│   Gestiona todos los stacks  │   │
│  │    clean-redeploy   │    │   Recibe webhooks y redeploya│   │
│  └──────┬──────────────┘    └──────────────────────────────┘   │
│         │                                                        │
│         ├── Docker Socket (/var/run/docker.sock)                │
│         ├── Dockerode (Node.js Docker API client)               │
│         └── GitHub API (fallback sin repos clonados)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## CI/CD — ¿Cómo funciona?

Este proyecto implementa **CD (Continuous Deployment)** completo. El flujo es:

```
Developer                GitHub               NexPulse             Portainer
   │                       │                     │                     │
   │── git push main ──────►│                     │                     │
   │                       │── GitHub Webhook ───►│                     │
   │                       │   POST /api/github/  │                     │
   │                       │   webhook            │                     │
   │                       │                     │── POST webhook ─────►│
   │                       │                     │   URL de Portainer   │
   │                       │                     │                     │── docker pull
   │                       │                     │                     │── docker build
   │                       │                     │◄── 200 OK ──────────│
   │                       │                     │                     │── containers up ✅
```

### ¿Cumple con CI/CD?

| Etapa | ¿Implementado? | Mecanismo |
|---|---|---|
| **CI — Continuous Integration** | ✅ Sí | GitHub Actions valida builds de NestJS y Angular en cada push |
| **CD — Continuous Delivery** | ✅ Sí | Push a `main` → GitHub Actions (CI) → NexPulse → Portainer |
| **CD — Deploy manual** | ✅ Sí | Botón "🚀 Deploy" en el dashboard |
| **CD — Force Clean Deploy** | ✅ Sí | Botón "🔥 Force Clean Redeploy" — baja containers y relanza |
| **Rollback** | ⚠️ Manual | Desde Portainer, apuntando a un commit anterior |

> **CI Automatizada:** GitHub Actions ejecutará un build de validación para asegurar que el código compila correctamente. Si el CI falla, el deploy en el VPS no se actualizará, evitando caídas en producción.

---

## Flujo de Deploy por Repo

| Repo | Webhook Portainer | URL Deploy |
|---|---|---|
| `landingdj` | ✅ Configurado | https://dj.katrix.com.ar |
| `metrics-docker` | ✅ Configurado | https://metricas.katrix.com.ar |
| `erp-eana` | ✅ Configurado | https://app.katrix.com.ar |
| `landing-k` | ⏳ Pendiente | https://katrix.com.ar |
| `Landing-Katrix-16-07` | ⏳ Pendiente | https://katrix.com.ar |

---

## Estabilidad y Red (Fixes v1.1)

Hemos optimizado el stack para operar bajo **1 VCPU / 2GB RAM**:

- **Proxy WSS (WebSockets)**: Nginx configurado con soporte nativo para `Upgrade` y `Connection` en `/socket.io`, estabilizando la comunicación en tiempo real.
- **Node.js Heap Management**: Backend optimizado con `--max-old-space-size=112` para evitar crashes por "Out of Memory" durante picos de carga (como el análisis de Dockerode).
- **Canvas Cleanup**: Solución al error "Canvas already in use" en el dashboard mediante la destrucción explícita de instancias anteriores de Chart.js al refrescar.
- **API Stability**: Configuración de timeouts de 300s en Nginx para soportar operaciones de Git pesadas sin errores 502.

---

## Stack Técnico

### Backend (`/backend`)
- **NestJS 10** con soporte WebSockets (Socket.IO)
- **Dockerode** — control de contenedores vía Docker socket
- **p-queue** — cola de operaciones git por repo (evita race conditions)
- **systeminformation** — métricas del host (CPU, RAM, disco, red)
- **otplib + qrcode** — 2FA TOTP compatible con Google Authenticator

### Frontend (`/frontend`)
- **Angular 17** standalone components
- **Chart.js** — gráficos de CPU/RAM en tiempo real
- **WebAuthn / FIDO2** — login biométrico (huella, Face ID) sin contraseña
- **Socket.IO client** — actualizaciones en tiempo real vía WebSocket

### Infraestructura
- **Nginx** — sirve el frontend y proxea al backend
- **Portainer** — gestiona los stacks Docker con webhooks automáticos
- **GitHub Webhooks** — trigger automático de deploy al hacer `git push`
- **Docker Compose** — orquestación local del stack de métricas

---

## Variables de Entorno

```yaml
# docker-compose.yml → backend-metrica
AUTH_PASS=katrix2026                    # Contraseña del dashboard
REPOSITORIES=landingdj,metrics-docker,erp-eana,...  # Repos a monitorear
REPOS_BASE_PATH=/repos                 # Path base de repos clonados (opcional)
GITHUB_TOKEN=ghp_...                  # Token GitHub (opcional, aumenta rate limit)

# Portainer webhooks — un webhook por repo
PORTAINER_WEBHOOK_LANDINGDJ=https://portainer.katrix.com.ar/api/stacks/webhooks/UUID
PORTAINER_WEBHOOK_METRICS_DOCKER=https://portainer.katrix.com.ar/api/stacks/webhooks/UUID
PORTAINER_WEBHOOK_ERP_EANA=https://portainer.katrix.com.ar/api/stacks/webhooks/UUID
```

---

## Funcionalidades Principales

### 🔔 Deploy Toast Notifications
Al hacer click en "🚀 Deploy":
1. Aparece toast bottom-right con barra de progreso animada
2. Se actualiza en tiempo real via WebSocket cuando termina
3. Al completar muestra la URL del servicio como link clickeable
4. Auto-dismiss a los 7s (success) / 12s (error)

### 🔥 Force Clean Redeploy
Solución cuando Portainer falla con "container name already in use":
1. Detecta contenedores del stack por label `com.docker.compose.project`
2. Hace `stop` + `remove` vía Docker API (sin SSH)
3. Dispara el webhook de Portainer → stack levanta limpio

### ⎇ Git Activity (modo offline)
Si los repos **no están clonados** en el VPS, el backend hace fallback automático a la GitHub API:
- Muestra último commit, autor y fecha
- Badge `GH API` indica el modo de origen
- El status aparece en verde (`UP TO DATE`) igual

### 🤖 Auto-optimización de RAM
Cada 90 segundos el backend analiza contenedores:
- Si CPU < 0.1% por 15+ ciclos → reduce RAM a mínimo (16MB)
- Si el container vuelve a usarse → restaura RAM automáticamente
- Nunca toca contenedores marcados como protegidos (`metricas-*`, `portainer`, `nginx`, etc.)

---

## Comandos

```bash
# Desarrollo local
cd frontend && npm install && npx ng serve --port 4205 --proxy-config proxy.conf.json
cd backend  && npm install && npm run start:dev

# Deploy en VPS (vía Portainer o manualmente)
docker compose up -d --build

# Ver logs
docker logs metricas-backend  -f
docker logs metricas-frontend -f
```

---

## GitHub Webhook (setup único)

Para que el deploy sea automático al hacer `git push`:

1. Ir al repo en GitHub → **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://metricas.katrix.com.ar/api/github/webhook`
3. **Content type:** `application/json`
4. **Events:** Solo `Push`
5. ✅ Active

El backend recibe el push, identifica el repo y dispara el webhook de Portainer correspondiente.

---

## Seguridad

- Dashboard protegido con contraseña (`AUTH_PASS`)
- Soporte 2FA con TOTP (Google Authenticator)
- Login biométrico con WebAuthn (requiere HTTPS)
- Webhook de GitHub sin secret (seguridad por oscuridad de URL — mejora futura: agregar `X-Hub-Signature-256`)
- Endpoints de API protegidos con `SimpleAuthGuard` (Bearer token)

---

*NexPulse by Katrix © 2026 — Built with ❤️ by Antigravity*
