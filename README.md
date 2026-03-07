# 🚀 NexPulse by Katrix

**NexPulse** es una suite de monitoreo de infraestructura ultra-ligera y de alto rendimiento, diseñada específicamente para entornos de recursos limitados (VPS con tan solo 1vCPU y 2GB de RAM). Proporciona visibilidad en tiempo real y optimización autónoma de recursos utilizando un stack tecnológico moderno y una interfaz premium.

![Estado](https://img.shields.io/badge/Estado-Listo%20para%20Producción-success?style=for-the-badge)
![Tecnología](https://img.shields.io/badge/Construido%20con-NestJS%20%26%20Angular-blue?style=for-the-badge)
![Optimización](https://img.shields.io/badge/Optimización%20RAM-Autónoma-blueviolet?style=for-the-badge)

## ✨ Características Principales

- **📊 Dashboard en Tiempo Real**: Interfaz oscura premium con visualizaciones fluidas en Chart.js para CPU y RAM.
- **🐳 Gestión de Docker**: Inicia, detiene, reinicia e hiberna contenedores o stacks completos de Docker Compose directamente desde la web.
- **🧠 Balanceo de RAM Autónomo**: Motor "Magic Optimize" que identifica servicios inactivos y los fuerza a un estado de RAM mínima (16MB) utilizando límites estrictos del kernel.
- **📲 Integración con WhatsApp**: Bot de comandos totalmente funcional a través de CallMeBot. Revisa el estado, lista stacks y activa optimizaciones directamente desde tu WhatsApp.
- **🔐 Seguridad Empresarial**:
  - **Login Biométrico**: Acceso seguro mediante Huella Digital o FaceID a través de WebAuthn.
  - **2FA (Autenticación de Dos Factores)**: Soporte para Google Authenticator en acciones críticas.
  - **Protección Nginx**: Puerta de enlace con Basic Auth integrada.
- **⚡ Consumo Eficiente**: Diseñado para consumir menos de 120MB de RAM, garantizando que el monitor no afecte el rendimiento de tus servicios de producción.

## 🛠️ Stack Tecnológico

| Capa                              | Tecnología                                            |
| :-------------------------------- | :----------------------------------------------------- |
| **Backend**                 | [NestJS](https://nestjs.com/) (Node.js)                   |
| **Frontend**                | [Angular 17](https://angular.io/) (Standalone Components) |
| **Visuales**                | [Chart.js](https://www.chartjs.org/)                      |
| **Docker API**              | [Dockerode](https://github.com/apocas/dockerode)          |
| **Información de Sistema** | [Systeminformation](https://systeminformation.io/)        |
| **Bot Móvil**              | Integración CallMeBot Webhook                         |

## 🚀 Inicio Rápido (Docker Compose)

La forma más sencilla de desplegar **NexPulse** es utilizando el archivo `docker-compose.yml` pre-configurado.

### 1. Requisitos

- Docker y Docker Compose instalados.
- Acceso al socket de Docker en `/var/run/docker.sock`.

### 2. Configuración

El sistema utiliza las siguientes credenciales por defecto en el `docker-compose.yml`:

- **Usuario**: `admin`
- **Contraseña**: `katrix2026` (Se recomienda cambiarlas mediante variables de entorno).

### 3. Despliegue

```bash
docker-compose up -d --build
```

Accede al dashboard en `http://TU_IP_SERVIDOR:4205`.

## 🤖 Control por WhatsApp

Simplemente conecta tu API de CallMeBot y envía un mensaje con la palabra `Hola` a tu bot. Recibirás un menú interactivo:

1. **Estado del Sistema**: Métricas actuales de RAM/CPU/Disco.
2. **Stacks Activos**: Lista de tus servicios Docker en ejecución.
3. **Magic Optimize**: Activa una limpieza profunda del sistema y balanceo de RAM.
4. **Análisis de Capacidad**: Información predictiva sobre cuántos stacks más puede soportar tu VPS.

## 📈 Estrategia de Optimización

NexPulse no solo monitorea, toma acción. Cuando se detecta que un servicio está **IDLE** (Bajo uso de CPU por un periodo prolongado), el sistema:

- Limita la `Memory` y `MemorySwap` a **16MB/32MB**.
- Reduce la `MemoryReservation` a **6MB**.
- Fuerza al kernel de Linux a reclamar las páginas de memoria no utilizadas, ahorrando hasta un 80% de RAM en servicios inactivos.

---

Desarrollado con ❤️ por **Katrix**. Pulsando el corazón de tu infraestructura.
