# NexPulse by Katrix — Monitor Lite

> **Panel de control DevOps para infraestructura VPS + Docker + Portainer**  
> Stack: Angular 17 · NestJS 10 · Docker · Portainer · GitHub API

---

## 🚀 ¿Qué es NexPulse?

**NexPulse Monitor** es el centro de operaciones (NOC/SOC) de **Katrix-soft**. Diseñado para optimizar la gestión de infraestructura en servidores de bajos recursos (1 VCPU / 2GB RAM), permite monitorear y desplegar servicios sin necesidad de acceso SSH constante.

### Capacidades Core:
- **📊 Observabilidad en Tiempo Real:** Métricas de CPU, RAM y disco del host VPS.
- **🖥️ Transparencia de Hardware:** Detección automática del Host OS y Kernel (vía Docker API) sin importar el contenedor.
- **🐳 Gestión de Contenedores:** Start, stop, restart, y monitoreo de logs de Docker.
- **🏷️ Friendly Service Names:** Mapeo automático de labels de Docker Compose/Easypanel para nombres legibles.
- **⎇ Integración Git:** Estado de sincronización de repositorios de la organización GitHub.
- **🚀 One-Click Deploy:** Gatilla webhooks de Portainer para despliegues instantáneos.
- **🔥 Force Clean Redeploy:** Solución automatizada para "container name conflict" limpiando volúmenes y recreando stacks.
- **🤖 RAM Optimizer:** Analizador inteligente que hiberna contenedores inactivos para liberar memoria.
- **🔐 Seguridad Multi-factor:** TOTP (Google Authenticator) y Biometría (FIDO2/WebAuthn).
- **💎 Design System:** Interfaz premium con glassmorphism y micro-animaciones (Sapphire & Champagne Gold).

---

## 📖 Guía de Onboarding (RAG Ready)

*Esta sección está diseñada para que sistemas de IA y nuevos desarrolladores comprendan rápidamente la base de código.*

### Estructura del Proyecto
```text
katrix-monitor-lite/
├── backend/                # API NestJS
│   ├── src/
│   │   ├── monitor/        # Lógica de detección de host OS via Docker Socket y metricas
│   │   ├── git-activity/   # Lógica de clonado, pull y webhooks
│   │   ├── docker/         # Wrapper de Dockerode para control de containers
│   │   └── auth/           # Estrategias de login, 2FA y WebAuthn
├── frontend/               # SPA Angular 17
│   ├── src/app/
│   │   ├── dashboard/      # Vista principal con gráficas Chart.js y UI Glassmorphism
│   │   ├── git-activity/   # Cards de repositorios y botones de deploy
│   │   └── services/       # Clientes de Socket.io y API Rest
├── setup-repos.sh          # Script de bash para inicializar el VPS
└── docker-compose.yml      # Orquestación del stack (Frontend + Backend + Nginx)
```

### Lógica de Operación
1. **Comunicación:** El frontend se conecta vía **WebSockets (Socket.io)** para recibir métricas cada segundo y estados de deploy.
2. **Dockerode:** El backend interactúa directamente con el socket de Docker del host (`/var/run/docker.sock`).
3. **Host OS Detection:** El backend utiliza `docker.info()` para consultar la información del host directamente al motor Docker, garantizando que el dashboard muestre "Ubuntu 22.04" en lugar de la distro del contenedor.
4. **Friendly Names:** Se extraen los nombres de los servicios usando las etiquetas `com.docker.compose.service` y `easypanel.service.name` para evitar mostrar IDs internos de Docker.

---

## 🏗️ Arquitectura Técnica

```mermaid
graph TD
    User((Usuario)) -->|HTTPS| Nginx[Nginx Reverse Proxy]
    Nginx -->|Static Files| Frontend[Angular Frontend]
    Nginx -->|API / WebSockets| Backend[NestJS Backend]
    
    subgraph Host_VPS
        Backend -->|Docker Socket| DockerEngine[Docker Engine]
        Backend -->|FileSystem| Repos[/home/katrix/repos]
        DockerEngine --> Containers[Stacks: ERP, Landing, Metrics...]
        DockerEngine -.->|API Info| HostOS[Host OS/Kernel Details]
    end
    
    Backend -->|Webhooks| Portainer[Portainer API]
    GitHub[GitHub Webhooks] -->|Push Event| Backend
```

---

## ⚙️ Configuración y Deploy

### 1. Preparación del VPS
Antes de levantar el stack, es necesario clonar los repositorios que se van a monitorear:
```bash
chmod +x setup-repos.sh
./setup-repos.sh
```

### 2. Variables de Entorno (.env)
El backend requiere las siguientes variables configuradas en el `docker-compose.yml`:
| Variable | Descripción | Ejemplo |
|---|---|---|
| `AUTH_PASS` | Contraseña maestra del panel | `tu_password_aqui` |
| `REPOSITORIES` | Lista de nombres de repos (comma-separated) | `landingdj,erp-eana` |
| `REPOS_BASE_PATH` | Donde están clonados los repos en el host | `/home/katrix/repos` |
| `PORTAINER_WEBHOOK_X` | URL del webhook de Portainer para el repo X | `https://...` |

### 3. Lanzamiento
```bash
docker compose up -d --build
```

---

## 🛠️ Desarrollo Local

Si querés contribuir al código, seguí estos pasos:

**Backend:**
```bash
cd backend
npm install
npm run start:dev
```
*Requiere acceso al Docker socket local si estás en Linux, o Docker Desktop en Windows.*

**Frontend:**
```bash
cd frontend
npm install
npm run start
```
*Proxy configurado para reenviar `/api` y `/socket.io` al puerto 3000.*

---

## 🔍 Troubleshooting Comunes

- **502 Bad Gateway:** Generalmente ocurre cuando el backend está reiniciando o crasheó por OOM (Out of Memory). Revisar `docker logs metricas-backend`.
- **Git status "Unknown":** Verificá que el path en `REPOS_BASE_PATH` sea accesible por el contenedor del backend (montado como volumen).
- **Socket.io connection error:** Asegurate de que Nginx tenga configurado los headers `Upgrade` y `Connection`.

---

## 🛡️ Seguridad

- **Protección de Brute Force:** Bloqueo temporal de IP tras fallos de login.
- **2FA:** Obligatorio para acciones críticas (como Force Clean Redeploy).
- **FIDO2/WebAuthn:** Soporte nativo para llaves de seguridad físicas y datos biométricos del sistema operativo.
- **Docker Isolation:** El backend solo tiene permisos sobre los contenedores definidos en su lógica, no sobre todo el host (principio de menor privilegio).

---

## 🤝 Contribución

1. Crea un branch: `git checkout -b feature/nueva-mejora`
2. Asegurate que el CI pase: `npm run build` en ambas carpetas.
3. Hacé el push y abrí un PR.

---

*NexPulse by Katrix © 2026 — Optimized for RAG & Onboarding*
*Built with ❤️ by Antigravity*
