import { Injectable, OnModuleInit } from '@nestjs/common';
import * as si from 'systeminformation';
import Docker from 'dockerode';
const { authenticator } = require('otplib');
import * as qrcode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MonitorService implements OnModuleInit {
    private readonly CONFIG_PATH = path.join(process.cwd(), 'katrix-config.json');
    private docker: Docker;
    private lastContainerCount = 0;
    private cpuAlertSent = false;
    private ramAlertSent = false;
    private diskAlertSent = false;
    private idleTracker: Map<string, number> = new Map();

    // ── Cache layer (reduces CPU/RAM load significantly) ──────────────────────
    private sysStatsCache: { data: any; ts: number } | null = null;
    private dockerStatsCache: { data: any; ts: number } | null = null;
    private processesCache: { data: any; ts: number } | null = null;
    private readonly CACHE_TTL_MS = 8000;   // 8 seconds
    private readonly PROC_CACHE_TTL = 5000; // 5 seconds for processes

    private isProtected(name: string): boolean {
        const n = name.toLowerCase().replace('/', '');
        return (
            n.includes('metrica') ||
            n.includes('portainer') ||
            n.includes('nginx') ||
            n.includes('proxy') ||
            n.includes('npm') ||
            n.includes('gateway') ||
            n.includes('duckdna') || // common dyndns/proxies
            n.includes('traefik') ||
            n.includes('watchtower')
        );
    }

    constructor() {
        const isWindows = process.platform === 'win32';
        const socketPath = isWindows ? '//./pipe/docker_engine' : '/var/run/docker.sock';
        this.docker = new Docker({ socketPath });
    }

    onModuleInit() {
        // Start automatic monitoring loop every 90 seconds (was 60)
        setInterval(() => this.checkAutomations(), 90000);

        // Periodically clean up idleTracker to prevent memory leak
        setInterval(() => {
            if (this.idleTracker.size > 200) {
                this.idleTracker.clear();
            }
        }, 300000); // every 5 min
    }

    async checkAutomations() {
        try {
            const thresholds = this.getThresholds();

            // Check for new containers (stacks)
            const containers = await this.docker.listContainers({ all: true });
            if (this.lastContainerCount > 0 && containers.length > this.lastContainerCount) {
                const newCount = containers.length - this.lastContainerCount;
                console.log(`[NexPulse] 🚀 Alerta: ${newCount} nuevos contenedores detectados. Total: ${containers.length}`);
            }
            this.lastContainerCount = containers.length;

            // Check system resources
            const stats = await this.getSystemStats();
            const cpuUsage = parseFloat(stats.cpu);
            const ramUsage = parseFloat(stats.memory.percent);

            // CPU Alert — log only
            if (cpuUsage > thresholds.cpuAlert && !this.cpuAlertSent) {
                console.warn(`[NexPulse] ⚠️ CPU CRÍTICO: ${cpuUsage}% (umbral: ${thresholds.cpuAlert}%)`);
                this.cpuAlertSent = true;
            } else if (cpuUsage < (thresholds.cpuAlert - 10) && this.cpuAlertSent) {
                console.log(`[NexPulse] ✅ CPU normalizado: ${cpuUsage}%`);
                this.cpuAlertSent = false;
            }

            // RAM Alert — log only
            if (ramUsage > thresholds.ramAlert && !this.ramAlertSent) {
                console.warn(`[NexPulse] 🔥 RAM CRÍTICA: ${ramUsage}% (umbral: ${thresholds.ramAlert}%)`);
                this.ramAlertSent = true;
            } else if (ramUsage < (thresholds.ramAlert - 10) && this.ramAlertSent) {
                console.log(`[NexPulse] ✅ RAM normalizada: ${ramUsage}%`);
                this.ramAlertSent = false;
            }

            // Disk Alert — log only
            if (stats.disk && stats.disk.length > 0) {
                const diskUse = parseFloat(stats.disk[0].use);
                if (diskUse > thresholds.diskAlert && !this.diskAlertSent) {
                    console.warn(`[NexPulse] 💾 DISCO CRÍTICO: ${diskUse}% (umbral: ${thresholds.diskAlert}%)`);
                    this.diskAlertSent = true;
                } else if (diskUse < (thresholds.diskAlert - 5) && this.diskAlertSent) {
                    console.log(`[NexPulse] ✅ Disco normalizado: ${diskUse}%`);
                    this.diskAlertSent = false;
                }
            }

            if (ramUsage > 85) {
                await this.autoOptimizeRAM(true);
            } else {
                await this.autoOptimizeRAM(false);
            }

        } catch (error) {
            console.error('Automation Loop Error:', error);
        }
    }

    private async autoOptimizeRAM(aggressive: boolean) {
        try {
            const containers = await this.docker.listContainers();
            for (const c of containers) {
                const container = this.docker.getContainer(c.Id);
                const stats = await container.stats({ stream: false });

                const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

                const name = c.Names[0].toLowerCase();
                const memUsedMB = stats.memory_stats.usage / 1024 / 1024;

                // PROTECT INFRASTRUCTURE: Never touch proxy, portainer or metrics
                if (this.isProtected(name)) continue;

                // SQUEEZE LOGIC: If CPU is idle (< 0.1%), force memory down
                if (cpuUsage < 0.1) {
                    const currentIdle = (this.idleTracker.get(c.Id) || 0) + 1;
                    this.idleTracker.set(c.Id, currentIdle);

                    // 100% RAM SAVING: Instead of stopping, apply a strict 16MB limit if idle for 15+ cycles
                    if (currentIdle >= 15) {
                        const targetMB = 16;
                        const bytes = targetMB * 1024 * 1024;
                        await container.update({
                            Memory: bytes,
                            MemorySwap: bytes,
                            MemoryReservation: Math.floor(6 * 1024 * 1024)
                        }).catch(() => { });
                        continue;
                    }

                    let targetMB = 0;
                    if (name.includes('backend') || name.includes('api')) {
                        if (memUsedMB > (aggressive ? 60 : 90)) targetMB = aggressive ? 64 : 96;
                    } else if (name.includes('frontend') && memUsedMB > 25) {
                        targetMB = 24;
                    } else if ((name.includes('postgres') || name.includes('db')) && memUsedMB > 50) {
                        targetMB = aggressive ? 64 : 96;
                    }

                    if (targetMB > 0) {
                        const bytes = targetMB * 1024 * 1024;
                        await container.update({
                            Memory: bytes,
                            MemorySwap: bytes,
                            MemoryReservation: Math.floor(12 * 1024 * 1024)
                        }).catch(() => { });
                    }
                } else {
                    // Service is being used! Give it RAM back and reset timer
                    this.idleTracker.set(c.Id, 0);
                    // Check if current limit is very low (e.g. 16MB or 24MB)
                    if (stats.memory_stats.limit < 100 * 1024 * 1024) {
                        await container.update({
                            Memory: 512 * 1024 * 1024,
                            MemorySwap: 1024 * 1024 * 1024, // Allow some swap when active
                            MemoryReservation: 128 * 1024 * 1024
                        }).catch(() => { });
                    }
                }
            }
        } catch (e) { }
    }

    async getSystemStats() {
        // Return cached result if fresh enough
        const now = Date.now();
        if (this.sysStatsCache && (now - this.sysStatsCache.ts) < this.CACHE_TTL_MS) {
            return this.sysStatsCache.data;
        }

        const [cpu, mem, fsData, net, time, os, cpuInfo] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkStats(),
            si.time(),
            si.osInfo(),
            si.cpu(),
        ]);

        // Detect platform family for display purposes
        const platform = process.platform;
        let osDisplay = `${os.distro || ''} ${os.release || ''}`.trim();

        // [FIX] Detect Host OS if running in a container with /host/etc/os-release mounted
        try {
            const hostOsPath = '/host/etc/os-release';
            if (fs.existsSync(hostOsPath)) {
                const content = fs.readFileSync(hostOsPath, 'utf8');
                const lines = content.split('\n');
                const prettyName = lines.find(l => l.startsWith('PRETTY_NAME='));
                if (prettyName) {
                    osDisplay = prettyName.split('=')[1].replace(/"/g, '');
                } else {
                    const name = lines.find(l => l.startsWith('NAME='));
                    if (name) osDisplay = name.split('=')[1].replace(/"/g, '');
                }
            }
        } catch (e) {
            console.error('[Monitor] Error detecting host OS:', e);
        }

        if (!osDisplay || osDisplay === ' ') {
            // Fallback for minimal containers without full OS detection
            if (platform === 'linux') osDisplay = `Linux ${os.kernel || ''}`;
            else if (platform === 'win32') osDisplay = `Windows ${os.release || ''}`;
            else if (platform === 'darwin') osDisplay = `macOS ${os.release || ''}`;
            else osDisplay = `${platform} ${os.release || ''}`;
        }

        // Memory breakdown (in GB)
        const toGB = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
        const toMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(0) + ' MB';

        // Swap info (available on Linux/macOS, 0 on Windows)
        const swapTotal = (mem as any).swaptotal ?? 0;
        const swapUsed = (mem as any).swapused ?? 0;

        // Cache/Buffer: systeminformation exposes these on Linux.
        // On Windows/Alpine they may be 0 — report what's available.
        const memBuffers = (mem as any).buffers ?? 0;
        const memCached = (mem as any).cached ?? 0;
        const memSlab = (mem as any).slab ?? 0;
        const totalCached = memCached + memSlab; // Total reclaimable cache

        const result = {
            hostname: os.hostname,
            os: osDisplay,
            platform: platform,
            kernel: os.kernel || 'N/A',
            arch: os.arch || process.arch,
            cpuModel: `${cpuInfo.manufacturer} ${cpuInfo.brand}`.trim() || 'Unknown CPU',
            cpuCores: cpuInfo.cores,
            cpuSpeed: cpuInfo.speed ? cpuInfo.speed + 'GHz' : 'N/A',
            cpu: cpu.currentLoad.toFixed(2),
            memory: {
                total: toGB(mem.total),
                used: toGB(mem.used),
                available: toGB(mem.available),
                free: toGB(mem.free),
                cached: totalCached > 0 ? toMB(totalCached) : null,
                buffers: memBuffers > 0 ? toMB(memBuffers) : null,
                swap: swapTotal > 0 ? `${toMB(swapUsed)} / ${toMB(swapTotal)}` : null,
                percent: ((mem.used / mem.total) * 100).toFixed(2),
                percentRaw: parseFloat(((mem.used / mem.total) * 100).toFixed(2)),
                totalRaw: mem.total,
                usedRaw: mem.used,
                availableRaw: mem.available,
            },
            disk: fsData
                .filter(d => !d.fs.includes('loop') && !d.fs.includes('tmpfs') && d.size > 0)
                .slice(0, 3) // Show up to 3 disks
                .map(d => ({
                    fs: d.fs,
                    mount: d.mount || '/',
                    size: toGB(d.size),
                    used: toGB(d.used),
                    use: d.use.toFixed(2),
                })),
            network: net
                .filter(n => n.iface && !n.iface.startsWith('lo')) // Exclude loopback
                .map(n => ({
                    iface: n.iface,
                    rx: (n.rx_sec / 1024).toFixed(2) + ' KB/s',
                    tx: (n.tx_sec / 1024).toFixed(2) + ' KB/s',
                })),
            uptime: this.formatUptime(time.uptime),
        };

        this.sysStatsCache = { data: result, ts: now };
        return result;
    }

    // ─── Top Processes (htop-like) ────────────────────────────────────────────
    async getTopProcesses() {
        const now = Date.now();
        if (this.processesCache && (now - this.processesCache.ts) < this.PROC_CACHE_TTL) {
            return this.processesCache.data;
        }

        try {
            const data = await si.processes();
            const list = data.list || [];

            // Top 10 by CPU
            const byCpu = [...list]
                .filter(p => p.pid > 0)
                .sort((a, b) => b.pcpu - a.pcpu)
                .slice(0, 12)
                .map(p => ({
                    pid: p.pid,
                    name: p.name || 'unknown',
                    command: (p.command || p.name || '').substring(0, 60),
                    cpu: p.pcpu.toFixed(1),
                    mem: p.pmem.toFixed(1),
                    memBytes: p.mem_rss ? (p.mem_rss / 1024).toFixed(0) + ' MB' : '—',
                    user: p.user || '—',
                    state: p.state || '?',
                }));

            // Top 10 by MEM
            const byMem = [...list]
                .filter(p => p.pid > 0)
                .sort((a, b) => b.pmem - a.pmem)
                .slice(0, 12)
                .map(p => ({
                    pid: p.pid,
                    name: p.name || 'unknown',
                    command: (p.command || p.name || '').substring(0, 60),
                    cpu: p.pcpu.toFixed(1),
                    mem: p.pmem.toFixed(1),
                    memBytes: p.mem_rss ? (p.mem_rss / 1024).toFixed(0) + ' MB' : '—',
                    user: p.user || '—',
                    state: p.state || '?',
                }));

            const result = {
                total: data.all,
                running: data.running,
                sleeping: data.sleeping,
                byCpu,
                byMem,
            };

            this.processesCache = { data: result, ts: now };
            return result;
        } catch (e: any) {
            console.error('[Processes] Error:', e.message);
            return { total: 0, running: 0, sleeping: 0, byCpu: [], byMem: [], error: e.message };
        }
    }

    // ─── Alert Thresholds ─────────────────────────────────────────────────────
    getThresholds(): { cpuAlert: number; ramAlert: number; diskAlert: number } {
        const defaults = { cpuAlert: 90, ramAlert: 90, diskAlert: 85 };
        try {
            if (!fs.existsSync(this.CONFIG_PATH)) return defaults;
            const config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
            return {
                cpuAlert:  typeof config.cpuAlert  === 'number' ? config.cpuAlert  : defaults.cpuAlert,
                ramAlert:  typeof config.ramAlert  === 'number' ? config.ramAlert  : defaults.ramAlert,
                diskAlert: typeof config.diskAlert === 'number' ? config.diskAlert : defaults.diskAlert,
            };
        } catch { return defaults; }
    }

    saveThresholds(cpuAlert: number, ramAlert: number, diskAlert: number) {
        try {
            let config: any = {};
            if (fs.existsSync(this.CONFIG_PATH)) {
                config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
            }
            config.cpuAlert  = Math.min(Math.max(cpuAlert,  1), 100);
            config.ramAlert  = Math.min(Math.max(ramAlert,  1), 100);
            config.diskAlert = Math.min(Math.max(diskAlert, 1), 100);
            fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
            return { success: true, thresholds: this.getThresholds() };
        } catch (e: any) {
            return { success: false, message: e.message };
        }
    }

    async optimizeSystem() {
        try {
            // 1. Traditional Pruning (Disk)
            // Fix: Use proper filters for pruning all unused images
            const pruneResults = await Promise.allSettled([
                this.docker.pruneContainers().catch(() => ({})),
                this.docker.pruneImages({ filters: { dangling: ["false"] } }).catch(() => ({})),
                this.docker.pruneNetworks().catch(() => ({})),
                this.docker.pruneVolumes().catch(() => ({})),
            ]);

            const freedSpace = pruneResults[1].status === 'fulfilled' ? (pruneResults[1].value as any).SpaceReclaimed || 0 : 0;
            const freedMB = (freedSpace / 1024 / 1024).toFixed(2);

            // 2. Active RAM Balancing (Memory)
            const containers = await this.docker.listContainers();
            let optimizedCount = 0;

            for (const containerInfo of containers) {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);

                    // Non-blocking stats check with timeout
                    const stats = await Promise.race([
                        container.stats({ stream: false }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout stats')), 2000))
                    ]) as any;

                    if (!stats || !stats.memory_stats || !stats.memory_stats.usage) continue;

                    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
                    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
                    const cpuUsage = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

                    const memUsedMB = stats.memory_stats.usage / 1024 / 1024;
                    const name = containerInfo.Names[0].toLowerCase();

                    if (this.isProtected(name)) continue;

                    if (cpuUsage < 0.1) {
                        let newLimitMB = 0;
                        if ((name.includes('backend') || name.includes('api')) && memUsedMB > 80) {
                            newLimitMB = 96;
                        } else if (name.includes('postgres') || name.includes('db') || name.includes('redis')) {
                            newLimitMB = Math.max(48, Math.floor(memUsedMB * 1.1));
                        } else if (name.includes('frontend') && memUsedMB > 30) {
                            newLimitMB = 32;
                        }

                        if (newLimitMB > 0) {
                            await container.update({
                                Memory: Math.floor(newLimitMB * 1024 * 1024),
                                MemoryReservation: Math.floor((newLimitMB / 2) * 1024 * 1024)
                            }).catch(() => { });
                            optimizedCount++;
                        }
                    }
                } catch (containerErr) {
                    // Continue with next container if one fails
                    continue;
                }
            }

            return {
                success: true,
                message: `✨ Optimización Maestra: ${freedMB}MB de disco liberados y ${optimizedCount} contenedores balanceados.`
            };
        } catch (error: any) {
            console.error('Optimization error:', error);
            return { success: false, message: 'Optimization error: ' + (error.message || 'Error desconocido') };
        }
    }

    // Helper: run async tasks with limited concurrency (avoids memory spikes)
    private async runConcurrent<T>(tasks: (() => Promise<T>)[], limit = 4): Promise<T[]> {
        const results: T[] = [];
        let idx = 0;
        async function worker() {
            while (idx < tasks.length) {
                const i = idx++;
                results[i] = await tasks[i]();
            }
        }
        const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
        await Promise.all(workers);
        return results;
    }

    async getDockerStats() {
        // Return cached result if fresh enough
        const now = Date.now();
        if (this.dockerStatsCache && (now - this.dockerStatsCache.ts) < this.CACHE_TTL_MS) {
            return this.dockerStatsCache.data;
        }

        try {
            const containers = await this.docker.listContainers({ all: true });

            // Use limited concurrency (4 at a time) instead of Promise.all for ALL containers
            const tasks = containers.map(containerInfo => async () => {
                try {
                    const container = this.docker.getContainer(containerInfo.Id);
                    const containerStats = await Promise.race([
                        container.stats({ stream: false }),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
                    ]) as any;

                    const cpuDelta = containerStats.cpu_stats.cpu_usage.total_usage - containerStats.precpu_stats.cpu_usage.total_usage;
                    const systemDelta = containerStats.cpu_stats.system_cpu_usage - containerStats.precpu_stats.system_cpu_usage;
                    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * containerStats.cpu_stats.online_cpus * 100 : 0;

                    const memUsed = containerStats.memory_stats.usage || 0;
                    const stack = containerInfo.Labels['com.docker.compose.project'] ||
                        containerInfo.Labels['com.docker.stack.namespace'] ||
                        'standalone';

                    return {
                        id: containerInfo.Id.substring(0, 12),
                        name: containerInfo.Names[0].replace('/', ''),
                        image: containerInfo.Image,
                        status: containerInfo.State,
                        stack,
                        cpu: cpuPercent.toFixed(2) + '%',
                        memory: (memUsed / 1024 / 1024).toFixed(2) + ' MB',
                        isIdle: cpuPercent < 0.05,
                        network: {
                            rx: ((containerStats.networks?.eth0?.rx_bytes || 0) / 1024 / 1024).toFixed(2) + ' MB',
                            tx: ((containerStats.networks?.eth0?.tx_bytes || 0) / 1024 / 1024).toFixed(2) + ' MB',
                        },
                        volumes: containerInfo.Mounts?.map(m => m.Destination) || [],
                    };
                } catch {
                    // Skip containers that fail/timeout
                    return null;
                }
            });

            const raw = await this.runConcurrent(tasks, 4);
            const stats = raw.filter(Boolean);

            this.dockerStatsCache = { data: stats, ts: now };
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

    async hibernateContainer(id: string) {
        // As requested: Idle only limits RAM. Hibernate now means "Set to minimum RAM (16MB)"
        return this.updateResources(id, 16, 5);
    }

    async startStack(stackName: string) {
        const containers = await this.docker.listContainers({ all: true });
        for (const c of containers) {
            const project = c.Labels['com.docker.compose.project'] || c.Labels['com.docker.stack.namespace'];
            if (project === stackName) {
                await this.docker.getContainer(c.Id).start().catch(() => { });
            }
        }
        return { success: true };
    }

    async stopStack(stackName: string) {
        const containers = await this.docker.listContainers({ all: true });
        for (const c of containers) {
            const project = c.Labels['com.docker.compose.project'] || c.Labels['com.docker.stack.namespace'];
            if (project === stackName) {
                await this.docker.getContainer(c.Id).stop().catch(() => { });
            }
        }
        return { success: true };
    }

    async restartStack(stackName: string) {
        const containers = await this.docker.listContainers({ all: true });
        for (const c of containers) {
            const project = c.Labels['com.docker.compose.project'] || c.Labels['com.docker.stack.namespace'];
            if (project === stackName) {
                await this.docker.getContainer(c.Id).restart().catch(() => { });
            }
        }
        return { success: true };
    }

    async hibernateStack(stackName: string) {
        const containers = await this.docker.listContainers({ all: true });
        for (const c of containers) {
            const project = c.Labels['com.docker.compose.project'] || c.Labels['com.docker.stack.namespace'];
            if (project === stackName) {
                await this.hibernateContainer(c.Id).catch(() => { });
            }
        }
        return { success: true };
    }

    async stopAllIdle() {
        const containers = await this.getDockerStats() as any[];
        let count = 0;
        for (const c of containers) {
            if (c.isIdle && c.status === 'running') {
                // Apply strict RAM limits instead of stopping
                await this.hibernateContainer(c.id);
                count++;
            }
        }
        return { success: true, count, message: 'Servidores IDLE optimizados a RAM mínima.' };
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
                // Docker minimum is 6MB.
                const safeMemory = Math.max(memoryLimit, 12);
                const memoryBytes = Math.floor(safeMemory * 1024 * 1024);

                updateConfig.Memory = memoryBytes;
                // FORCE MEMORY DOWN: Set MemorySwap to same as Memory to disable extra swap usage
                // This forces the container to stay within the 16/32MB limit.
                updateConfig.MemorySwap = memoryBytes;

                // Set Reservation to very low to signal low priority to kernel
                updateConfig.MemoryReservation = Math.floor(6 * 1024 * 1024);
            }

            if (cpuLimit > 0) {
                // 100% CPU = 1000000000 NanoCPUs
                updateConfig.NanoCPUs = Math.floor((cpuLimit / 100) * 1000000000);
            }

            const result = await container.update(updateConfig);

            // For checking effectiveness in logs
            console.log(`Updated container ${id}: Mem=${memoryLimit}MB, CPU=${cpuLimit}%`);
            return result;
        } catch (error: any) {
            console.error('Docker update error:', error);
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
            return `👋 ¡Hola! Soy *NexPulse Monitor* by Katrix
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

    async get2FAConfig() {
        if (!fs.existsSync(this.CONFIG_PATH)) {
            return { enabled: false };
        }
        const config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
        return { enabled: !!config.otpSecret };
    }

    async setup2FA() {
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri('admin', 'NexPulse by Katrix', secret);

        const qrCode = await qrcode.toDataURL(otpauth);

        // Save pending secret (don't commit yet until verified)
        return { secret, qrCode };
    }

    async verifyAndSave2FA(secret: string, code: string) {
        const isValid = authenticator.verify({ token: code, secret });
        if (isValid) {
            let config = {};
            if (fs.existsSync(this.CONFIG_PATH)) {
                config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
            }
            config['otpSecret'] = secret;
            fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
            return { success: true };
        }
        return { success: false, message: 'Código inválido' };
    }

    async validate2FALogin(code: string) {
        if (!fs.existsSync(this.CONFIG_PATH)) return { success: false };
        const config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
        if (!config.otpSecret) return { success: false };

        const isValid = authenticator.verify({ token: code, secret: config.otpSecret });
        return { success: isValid };
    }

    async disable2FA() {
        if (fs.existsSync(this.CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(this.CONFIG_PATH, 'utf8'));
            delete config.otpSecret;
            fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(config, null, 2));
        }
        return { success: true };
    }

    private formatUptime(seconds: number): string {
        const days = Math.floor(seconds / (3600 * 24));
        const hours = Math.floor((seconds % (3600 * 24)) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${days}d ${hours}h ${mins}m`;
    }
}
