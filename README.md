# 🚀 NexPulse Monitor

**NexPulse** is an ultra-lightweight, high-performance infrastructure monitoring suite designed specifically for low-resource environments (VPS with as little as 1vCPU and 2GB RAM). It provides real-time visibility and autonomous resource optimization using a modern, premium stack.

![Status](https://img.shields.io/badge/Status-Production--Ready-success?style=for-the-badge)
![Tech](https://img.shields.io/badge/Built%20with-NestJS%20%26%20Angular-blue?style=for-the-badge)
![Optimization](https://img.shields.io/badge/RAM%20Optimization-Autonomous-blueviolet?style=for-the-badge)

## ✨ Key Features

- **📊 Real-time Dashboard**: Beautiful dark-mode interface with smooth Chart.js visualizations for CPU and RAM.
- **🐳 Docker Management**: Start, stop, restart, and hibernate containers or entire Docker Compose stacks directly from the web.
- **🧠 Autonomous RAM Balancing**: "Magic Optimize" engine that identifies idle services and forces them into a minimum RAM state (16MB) using strict kernel limits.
- **📲 WhatsApp Integration**: Fully functional command-line bot via CallMeBot. Check status, list stacks, and trigger optimizations directly from WhatsApp.
- **🔐 Enterprise Security**:
  - **Biometric Login**: Secure access using Fingerprint/FaceID via WebAuthn.
  - **2FA (Two-Factor Authentication)**: Google Authenticator support for critical actions.
  - **Nginx Protection**: Built-in Basic Auth gateway.
- **⚡ Resource Constraints**: Hard-capped to consume less than 120MB of RAM itself, ensuring no performance impact on your production services.

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | [NestJS](https://nestjs.com/) (Node.js) |
| **Frontend** | [Angular 17](https://angular.io/) (Standalone Components) |
| **Visuals** | [Chart.js](https://www.chartjs.org/) |
| **Docker API** | [Dockerode](https://github.com/apocas/dockerode) |
| **System Info** | [Systeminformation](https://systeminformation.io/) |
| **Mobile Bot** | CallMeBot Webhook Integration |

## 🚀 Quick Start (Docker Compose)

The easiest way to deploy **NexPulse** is using the pre-configured `docker-compose.yml`.

### 1. Prerequisites
- Docker & Docker Compose installed.
- Access to `/var/run/docker.sock` (automatic inside the container).

### 2. Configuration
The system uses the following default credentials in `docker-compose.yml`:
- **User**: `admin`
- **Password**: `katrix2026` (It is recommended to change these via environment variables).

### 3. Deploy
```bash
docker-compose up -d --build
```
Access the dashboard at `http://YOUR_SERVER_IP:4205`.

## 🤖 WhatsApp Control
Simply connect your CallMeBot API and send `Hola` to your bot. You will receive an interactive menu:
1. **System Status**: Get current RAM/CPU/Disk metrics.
2. **Active Stacks**: List your running Docker services.
3. **Magic Optimize**: Trigger a deep system cleanup and RAM balancing.
4. **Capacity Analysis**: Predictive info on how many more stacks your VPS can handle.

## 📈 Optimization Strategy
NexPulse doesn't just monitor; it takes action. When a service is detected as **IDLE** (Low CPU for an extended period), the system:
- Limits `Memory` and `MemorySwap` to **16MB/32MB**.
- Reduces `MemoryReservation` to **6MB**.
- Effectively forces the Linux kernel to reclaim unused pages, saving up to 80% RAM on idle services.

## 📜 License
Developed with ❤️ by **NexPulse Ops**. Part of the Katrix soft ecosystem.
