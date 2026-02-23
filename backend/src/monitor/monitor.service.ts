import { Injectable, OnModuleInit } from '@nestjs/common';
import * as si from 'systeminformation';
import * as Docker from 'dockerode';

@Injectable()
export class MonitorService implements OnModuleInit {
    private docker: Docker;
    private lastContainerCount = 0;
    private cpuAlertSent = false;
    private ramAlertSent = false;
    private diskAlertSent = false;

    constructor() {
        const isWindows = process.platform === 'win32';
        const socketPath = isWindows ? '//./pipe/docker_engine' : '/var/run/docker.sock';
        this.docker = new Docker({ socketPath });
    }

    onModuleInit() {
        // Start automatic monitoring loop every 60 seconds
        setInterval(() => this.checkAutomations(), 60000);
    }

    async checkAutomations() {
        try {
            // Check for new containers (stacks)
            const containers = await this.docker.listContainers({ all: true });
            if (this.lastContainerCount > 0 && containers.length > this.lastContainerCount) {
                const newCount = containers.length - this.lastContainerCount;
                await this.sendWhatsApp(`🚀 ¡Alerta! Se han detectado ${newCount} nuevos contenedores/stacks. Total actual: ${containers.length}`);
            }
            this.lastContainerCount = containers.length;

            // Check system resources
            const stats = await this.getSystemStats();
            const cpuUsage = parseFloat(stats.cpu);
            const ramUsage = parseFloat(stats.memory.percent);

            // CPU Alert (Threshold 90%)
            if (cpuUsage > 90 && !this.cpuAlertSent) {
                await this.sendWhatsApp(`⚠️ ¡CRÍTICO! El uso de CPU ha superado el 90% (${cpuUsage}%).`);
                this.cpuAlertSent = true;
            } else if (cpuUsage < 80 && this.cpuAlertSent) {
                await this.sendWhatsApp(`✅ Info: El uso de CPU se ha normalizado (${cpuUsage}%).`);
                this.cpuAlertSent = false;
            }

            // RAM Alert (Threshold 90%)
            if (ramUsage > 90 && !this.ramAlertSent) {
                await this.sendWhatsApp(`🔥 ¡CRÍTICO! El uso de RAM ha superado el 90% (${ramUsage}%).`);
                this.ramAlertSent = true;
            } else if (ramUsage < 80 && this.ramAlertSent) {
                await this.sendWhatsApp(`✅ Info: El uso de RAM se ha normalizado (${ramUsage}%).`);
                this.ramAlertSent = false;
            }

            // Disk Alert (Threshold 80%)
            const diskUsage = parseFloat(stats.disk[0]?.use || '0');
            if (diskUsage > 80 && !this.diskAlertSent) {
                await this.sendWhatsApp(`💾 ¡Alerta de DISCO! El espacio usado ha superado el 80% (${diskUsage}%). Se recomienda ejecutar MAGIC OPTIMIZE.`);
                this.diskAlertSent = true;
            } else if (diskUsage < 75 && this.diskAlertSent) {
                await this.sendWhatsApp(`✅ Info: El espacio en DISCO se ha liberado (${diskUsage}%).`);
                this.diskAlertSent = false;
            }

        } catch (error) {
            console.error('Automation Loop Error:', error);
        }
    }

    async getSystemStats() {
        const [cpu, mem, fs, net, time, os, cpuInfo] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkStats(),
            si.time(),
            si.osInfo(),
            si.cpu(),
        ]);

        return {
            hostname: os.hostname,
            os: `${os.distro} ${os.release}`,
            kernel: os.kernel,
            arch: os.arch,
            cpuModel: `${cpuInfo.manufacturer} ${cpuInfo.brand}`,
            cpuCores: cpuInfo.cores,
            cpuSpeed: cpuInfo.speed + 'GHz',
            cpu: cpu.currentLoad.toFixed(2),
            memory: {
                total: (mem.total / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                used: (mem.used / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                available: (mem.available / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                free: (mem.free / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                percent: ((mem.used / mem.total) * 100).toFixed(2),
            },
            disk: fs
                .filter(d => !d.fs.includes('loop') && !d.fs.includes('tmpfs'))
                .slice(0, 1) // Only show the main disk as requested
                .map(d => ({
                    fs: d.fs,
                    size: (d.size / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                    used: (d.used / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                    use: d.use.toFixed(2),
                })),
            network: net.map(n => ({
                iface: n.iface,
                rx: (n.rx_sec / 1024).toFixed(2) + ' KB/s',
                tx: (n.tx_sec / 1024).toFixed(2) + ' KB/s',
            })),
            uptime: this.formatUptime(time.uptime),
        };
    }

    async optimizeSystem() {
        try {
            // MAGIC OPTIMIZE: Deep clean of Docker to recover RAM and Disk
            const results = await Promise.all([
                this.docker.pruneContainers(),
                this.docker.pruneImages({ dall: true }),
                this.docker.pruneNetworks(),
                this.docker.pruneVolumes(), // Clear unused volumes (Disk!)
            ]);

            const freedSpace = results[1]?.SpaceReclaimed || 0;
            const freedMB = (freedSpace / 1024 / 1024).toFixed(2);

            return {
                success: true,
                message: `✨ Magic Optimize completa: Se recuperaron aprox. ${freedMB}MB de espacio y se limpiaron recursos inactivos.`
            };
        } catch (error: any) {
            console.error('Optimization error:', error);
            return { success: false, message: 'Optimization error: ' + error.message };
        }
    }

    async getDockerStats() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const stats = await Promise.all(
                containers.map(async (containerInfo) => {
                    const container = this.docker.getContainer(containerInfo.Id);
                    const containerStats = await container.stats({ stream: false });

                    // Basic CPU calculation from docker stats
                    const cpuDelta = containerStats.cpu_stats.cpu_usage.total_usage - containerStats.precpu_stats.cpu_usage.total_usage;
                    const systemDelta = containerStats.cpu_stats.system_cpu_usage - containerStats.precpu_stats.system_cpu_usage;
                    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * containerStats.cpu_stats.online_cpus * 100 : 0;

                    const memUsed = containerStats.memory_stats.usage;
                    const memLimit = containerStats.memory_stats.limit;

                    return {
                        id: containerInfo.Id.substring(0, 12),
                        name: containerInfo.Names[0].replace('/', ''),
                        image: containerInfo.Image,
                        status: containerInfo.State,
                        cpu: cpuPercent.toFixed(2) + '%',
                        memory: (memUsed / 1024 / 1024).toFixed(2) + ' MB',
                        network: {
                            rx: (containerStats.networks?.eth0?.rx_bytes / 1024 / 1024).toFixed(2) + ' MB',
                            tx: (containerStats.networks?.eth0?.tx_bytes / 1024 / 1024).toFixed(2) + ' MB',
                        },
                        volumes: containerInfo.Mounts?.map(m => m.Destination) || [],
                    };
                })
            );
            return stats;
        } catch (error) {
            return { error: 'Docker socket not available or permission denied' };
        }
    }

    async restartContainer(id: string) {
        const container = this.docker.getContainer(id);
        return container.restart();
    }

    async stopContainer(id: string) {
        const container = this.docker.getContainer(id);
        return container.stop();
    }

    async startContainer(id: string) {
        const container = this.docker.getContainer(id);
        return container.start();
    }

    async getContainerLogs(id: string) {
        const container = this.docker.getContainer(id);
        const buffer = await container.logs({
            stdout: true,
            stderr: true,
            tail: 100,
            timestamps: true,
            follow: false
        }) as Buffer;

        let logs = '';
        let offset = 0;

        // Docker multiplex stream: [1 byte type, 3 bytes skip, 4 bytes size BE]
        while (offset < buffer.length) {
            const type = buffer.readUInt8(offset);
            // Types: 0=stdin, 1=stdout, 2=stderr
            if (type > 2) {
                // Not a multiplexed stream, or we reached something unexpected
                return { logs: buffer.toString('utf8') };
            }
            const size = buffer.readUInt32BE(offset + 4);
            const content = buffer.toString('utf8', offset + 8, offset + 8 + size);
            logs += content;
            offset += 8 + size;
        }

        return { logs: logs || buffer.toString('utf8') };
    }

    async updateResources(id: string, memoryLimit: number, cpuLimit: number) {
        try {
            const container = this.docker.getContainer(id);
            const updateConfig: any = {};

            if (memoryLimit > 0) {
                // Docker minimum is 6MB. If user puts less, we force 6MB.
                const safeMemory = Math.max(memoryLimit, 6);
                updateConfig.Memory = Math.floor(safeMemory * 1024 * 1024);
                // Also set Reservation to avoid potential Docker conflicts
                updateConfig.MemoryReservation = Math.floor((safeMemory / 2) * 1024 * 1024);
            }

            if (cpuLimit > 0) {
                updateConfig.NanoCPUs = Math.floor((cpuLimit / 100) * 1000000000);
            }

            return await container.update(updateConfig);
        } catch (error: any) {
            console.error('Docker update error:', error);
            // Extracts the specific error from Docker daemon
            const reason = error.json?.message || error.message || 'Restriccion de Docker';
            throw new Error(reason);
        }
    }

    async sendWhatsApp(message: string) {
        try {
            // Hardcoded as requested: phone 5492616557673, apikey 4034379
            const phone = '5492616557673';
            const apiKey = '4034379';
            const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;

            const response = await fetch(url);
            return response.ok;
        } catch (error) {
            console.error('CallMeBot Notification Error:', error);
            return false;
        }
    }

    async sendTelegram(botToken: string, chatId: string, message: string) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message })
            });
            return response.ok;
        } catch (error) {
            console.error('Telegram Notification Error:', error);
            return false;
        }
    }

    async sendWhin(message: string) {
        try {
            // Whin Personal Message via RapidAPI (to your self/number)
            const response = await fetch('https://whin2.p.rapidapi.com/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-rapidapi-host': 'whin2.p.rapidapi.com',
                    'x-rapidapi-key': 'c3015f1769mshb086ce09484997ep13c1ddjsne0b15370aa68'
                },
                body: JSON.stringify({ text: message })
            });
            return response.ok;
        } catch (error) {
            console.error('Whin RapidAPI Error:', error);
            return false;
        }
    }

    async processCommand(input: string): Promise<string> {
        const cmd = input.trim().toLowerCase();

        if (cmd === 'hola' || cmd === 'menu' || cmd === '0') {
            return `👋 ¡Hola! Soy *Katrix Monitor Lite*
¿En qué puedo ayudarte hoy?

1️⃣ *Estado del Sistema* (RAM/CPU)
2️⃣ *Stacks Activos* (Docker)
3️⃣ *Magic Optimize* (Limpieza)
4️⃣ *Capacidad* (Stacks libres)

Escribí el número de la opción o *Hola* para volver a ver este menú.`;
        }

        if (cmd === '1') {
            const stats = await this.getSystemStats();
            return `📊 *Estado del Sistema*
🖥️ CPU: ${stats.cpu}%
🧠 RAM: ${stats.memory.used} / ${stats.memory.total} (${stats.memory.percent}%)
💾 Disco: ${stats.disk[0]?.use}% (${stats.disk[0]?.used} / ${stats.disk[0]?.size})
⏱️ Uptime: ${stats.uptime}`;
        }

        if (cmd === '2') {
            const docker = await this.getDockerStats() as any[];
            if (!Array.isArray(docker)) return "❌ No se pudo conectar con el Socket de Docker.";

            let list = `🐳 *Contenedores Activos (${docker.filter(c => c.status === 'running').length}):*\n`;
            docker.slice(0, 10).forEach(c => {
                const icon = c.status === 'running' ? '🟢' : '🔴';
                list += `${icon} ${c.name} (${c.cpu})\n`;
            });
            if (docker.length > 10) list += `...y ${docker.length - 10} más.`;
            return list;
        }

        if (cmd === '3') {
            const res = await this.optimizeSystem();
            return res.success ? `✨ *${res.message}*` : `❌ Error al optimizar: ${res.message}`;
        }

        if (cmd === '4') {
            const stats = await this.getSystemStats();
            const availableMB = parseFloat(stats.memory.available) * 1024;
            const safeMB = Math.max(0, availableMB - 150);
            const potentialStacks = Math.floor(safeMB / 256);

            return `🚀 *Análisis de Capacidad*
Podés subir aproximadamente *${potentialStacks} stacks más* (basado en proyectos de ~256MB).
Memoria segura disponible: ${Math.round(safeMB)} MB.`;
        }

        return "🤔 No entiendo ese comando. Escribí *Hola* para ver el menú.";
    }

    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }
}
