import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, HttpClientModule, FormsModule],
    templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
    system: any = null;
    docker: any[] = [];
    interval: any;
    paused = false;
    isLoggedIn = false;
    isBiometricLinked = false;
    is2FAEnabled = false;
    biometrySupported = false;
    showBioSetupPrompt = false;

    loginPassword = '';
    login2FACode = '';
    loginError = '';

    // 2FA Setup
    show2FASetup = false;
    pending2FASecret = '';
    qrCode2FA = '';
    verificationCode2FA = '';

    showLogs = false;
    currentLogs = '';
    selectedContainer: any = null;
    statusMessage = '';
    searchTerm = '';
    logInterval: any;
    showEditModal = false;
    showSettings = false;
    selectedMemory = 128;
    selectedCpu = 50;

    // Custom Confirm Modal
    showConfirm = false;
    confirmTitle = '';
    confirmText = '';
    confirmIcon = '⚠️';
    confirmAction: () => void = () => { };
    isDangerAction = false;

    // WhatsApp settings
    waPhone = '';
    waApiKey = '';

    // Telegram settings
    tgToken = '';
    tgChatId = '';

    // Whin settings (Alt WhatsApp)
    whinToken = '';

    @ViewChild('cpuChart') cpuChartRef!: ElementRef;
    @ViewChild('memChart') memChartRef!: ElementRef;

    cpuChart: any;
    memChart: any;

    cpuData: number[] = [];
    memData: number[] = [];
    labels: string[] = [];
    window = window;

    constructor(private http: HttpClient) { }

    ngOnInit() {
        const token = localStorage.getItem('katrix_token');
        this.isBiometricLinked = localStorage.getItem('katrix_bio_linked') === 'true';
        this.check2FAStatus();

        if (token === 'katrix-secret-token') {
            this.isLoggedIn = true;
            this.startApp();
        } else {
            // Auto-check if we can suggest biometrics
            this.checkBiometricsAvailability();
        }
    }

    async checkBiometricsAvailability() {
        if (window.PublicKeyCredential) {
            // Chrome/Safari on mobile often return false if not on HTTPS or if user hasn't interacted.
            // We just check if the API exists.
            this.biometrySupported = true;
        } else {
            this.biometrySupported = false;
        }
    }

    logout() {
        localStorage.removeItem('katrix_token');
        this.isLoggedIn = false;
        if (this.interval) clearInterval(this.interval);
        // Reset state
        this.system = null;
        this.docker = [];
    }

    login() {
        if (!this.loginPassword) return;
        this.http.post('/api/login', { password: this.loginPassword }).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.isLoggedIn = true;
                    if (this.biometrySupported && !this.isBiometricLinked) {
                        this.showBioSetupPrompt = true;
                    }
                    localStorage.setItem('katrix_token', res.token);
                    this.startApp();
                } else {
                    this.loginError = 'Acceso denegado. Contraseña incorrecta.';
                }
            },
            error: () => this.loginError = 'Error de conexión con el servidor.'
        });
    }

    login2FA() {
        if (!this.login2FACode) return;
        this.http.post('/api/2fa/login', { code: this.login2FACode }).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.isLoggedIn = true;
                    localStorage.setItem('katrix_token', res.token);
                    this.startApp();
                } else {
                    this.loginError = 'Código 2FA incorrecto.';
                }
            },
            error: () => this.loginError = 'Error al validar 2FA.'
        });
    }

    check2FAStatus() {
        this.http.get('/api/2fa/config').subscribe((res: any) => {
            this.is2FAEnabled = res.enabled;
        });
    }

    start2FASetup() {
        this.http.post('/api/2fa/setup', {}).subscribe((res: any) => {
            this.pending2FASecret = res.secret;
            this.qrCode2FA = res.qrCode;
            this.show2FASetup = true;
        });
    }

    verifyAndSave2FA() {
        this.http.post('/api/2fa/verify', {
            secret: this.pending2FASecret,
            code: this.verificationCode2FA
        }).subscribe({
            next: (res: any) => {
                if (res.success) {
                    this.is2FAEnabled = true;
                    this.show2FASetup = false;
                    this.statusMessage = '✅ Google Authenticator activado';
                    this.clearStatus();
                } else {
                    this.statusMessage = '❌ Código incorrecto';
                    this.clearStatus();
                }
            },
            error: () => this.statusMessage = '❌ Error de red'
        });
    }

    openConfirm(title: string, text: string, icon: string, action: () => void, isDanger: boolean = false) {
        this.confirmTitle = title;
        this.confirmText = text;
        this.confirmIcon = icon;
        this.confirmAction = () => {
            action();
            this.showConfirm = false;
        };
        this.isDangerAction = isDanger;
        this.showConfirm = true;
    }

    disable2FA() {
        this.openConfirm(
            'Desactivar 2FA',
            '¿Estás seguro de que quieres desactivar la verificación en dos pasos? Tu cuenta será menos segura.',
            '🔐',
            () => {
                this.http.post('/api/2fa/disable', {}).subscribe(() => {
                    this.is2FAEnabled = false;
                    this.statusMessage = '✅ 2FA desactivada';
                    this.clearStatus();
                });
            },
            true
        );
    }

    async loginWithBiometrics() {
        if (!window.PublicKeyCredential) {
            this.loginError = 'Biometría no disponible en este navegador.';
            return;
        }

        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            this.loginError = '❌ REQUERIDO: HTTPS para usar Huella/Cara.';
            return;
        }

        try {
            this.statusMessage = 'Diga "Patata" al sensor...';
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            // WebAuthn RP ID must be the domain without port/protocol
            const rpId = window.location.hostname;

            const options: any = {
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Katrix Monitor Lite", id: rpId },
                    user: {
                        id: Uint8Array.from("katrix-user-" + rpId, c => c.charCodeAt(0)),
                        name: "admin",
                        displayName: "Admin"
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required"
                    },
                    timeout: 60000
                }
            };

            await navigator.credentials.create(options);

            // If we reach here, user passed local sensor
            this.isLoggedIn = true;
            localStorage.setItem('katrix_token', 'katrix-secret-token');
            this.startApp();
            this.statusMessage = '✅ Acceso verificado';
        } catch (e: any) {
            console.error('BioError:', e);
            if (e.name === 'SecurityError') {
                this.loginError = '❌ Error de Dominio: No puedes usar IPs, solo dominios real con SSL.';
            } else if (e.name === 'NotAllowedError') {
                this.loginError = 'Acceso cancelado.';
            } else {
                this.loginError = 'Error: ' + (e.message || 'Fallo biometría');
            }
            this.statusMessage = '';
        }
    }

    async activateBiometrics() {
        if (!window.PublicKeyCredential) return;

        try {
            this.statusMessage = 'Escanea tu huella para vincular...';
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const options: any = {
                publicKey: {
                    challenge: challenge,
                    rp: { name: "Katrix Monitor", id: window.location.hostname },
                    user: {
                        id: Uint8Array.from("katrix-v3", c => c.charCodeAt(0)),
                        name: "admin@katrix",
                        displayName: "Admin Katrix"
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: { userVerification: "required" },
                    timeout: 60000
                }
            };

            await navigator.credentials.create(options);

            this.isBiometricLinked = true;
            localStorage.setItem('katrix_bio_linked', 'true');
            this.statusMessage = '✅ ¡Huella vinculada con éxito!';
            this.clearStatus();
        } catch (e: any) {
            this.statusMessage = '❌ Error al vincular';
            this.clearStatus();
        }
    }

    startApp() {
        this.fetchData();
        this.interval = setInterval(() => this.fetchData(), 5000);

        // Essential: Init charts after DOM is rendered by *ngIf
        setTimeout(() => {
            this.initCharts();
        }, 300);
    }

    ngAfterViewInit() {
        this.initCharts();
    }

    ngOnDestroy() {
        if (this.interval) clearInterval(this.interval);
    }

    fetchData() {
        if (this.paused) return;
        this.http.get('/api/system').subscribe((data: any) => {
            this.system = data;
            this.updateCharts(data);
        });
        this.http.get('/api/docker').subscribe((data: any) => {
            this.docker = Array.isArray(data) ? data : [];
        });
    }

    togglePause() {
        this.paused = !this.paused;
    }

    getRecommendation(name: string): string {
        const n = name.toLowerCase();
        if (n.includes('web') || n.includes('frontend') || n.includes('proxy') || n.includes('nginx')) {
            return 'Service identified as Static/Proxy. Recommended: 16MB - 32MB.';
        }
        if (n.includes('backend') || n.includes('api')) {
            return 'Service identified as Backend. Recommended: 128MB - 256MB.';
        }
        if (n.includes('db') || n.includes('postgres') || n.includes('sql') || n.includes('mongo')) {
            return 'Service identified as Database. Recommended: 256MB+ for stability.';
        }
        if (n.includes('redis')) {
            return 'Service identified as Cache. Recommended: 32MB - 64MB.';
        }
        return 'Recommended limit: 128MB.';
    }

    getCapacityInfo(): { remaining: number, stacks: number, status: string } {
        if (!this.system || !this.system.memory) return { remaining: 0, stacks: 0, status: 'Unknown' };

        // Host Available RAM in MB (Real free RAM including buffers)
        const availableMB = parseFloat(this.system.memory.available) * 1024;

        // We reserve a "Safety Margin" of 150MB for the OS basics
        const safeMB = Math.max(0, availableMB - 150);

        // Assuming a standard ERP stack (Backend+Frontend+DB) takes ~256MB
        const standardStackMB = 256;
        const potentialStacks = Math.floor(safeMB / standardStackMB);

        let status = 'HEALTHY';
        if (safeMB < 300) status = 'CRITICAL';
        else if (safeMB < 600) status = 'WARNING';

        return {
            remaining: Math.round(safeMB),
            stacks: potentialStacks,
            status: status
        };
    }

    stopContainer(id: string) {
        this.statusMessage = '⏳ Deteniendo contenedor...';
        this.http.post(`/api/docker/stop/${id}`, {}).subscribe(() => {
            this.statusMessage = '✅ Contenedor detenido';
            this.clearStatus();
            this.fetchData();
        });
    }

    startContainer(id: string) {
        this.statusMessage = '⏳ Iniciando contenedor...';
        this.http.post(`/api/docker/start/${id}`, {}).subscribe(() => {
            this.statusMessage = '✅ Contenedor iniciado';
            this.clearStatus();
            this.fetchData();
        });
    }

    restartContainer(id: string) {
        this.statusMessage = '⏳ Reiniciando contenedor...';
        this.http.post(`/api/docker/restart/${id}`, {}).subscribe(() => {
            this.statusMessage = '✅ Contenedor reiniciado';
            this.clearStatus();
            this.fetchData();
        });
    }

    hibernateContainer(id: string) {
        this.statusMessage = '⏳ Optimizando RAM de contenedor...';
        this.http.post(`/api/docker/hibernate/${id}`, {}).subscribe(() => {
            this.statusMessage = '✅ RAM Minimizada (16MB)';
            this.clearStatus();
            this.fetchData();
        });
    }

    startStack(name: string) {
        this.statusMessage = `⏳ Iniciando Stack ${name}...`;
        this.http.post('/api/docker/stack/start', { name }).subscribe(() => {
            this.statusMessage = `✅ Stack ${name} iniciado`;
            this.clearStatus();
            this.fetchData();
        });
    }

    stopStack(name: string) {
        this.statusMessage = `⏳ Deteniendo Stack ${name}...`;
        this.http.post('/api/docker/stack/stop', { name }).subscribe(() => {
            this.statusMessage = `✅ Stack ${name} detenido`;
            this.clearStatus();
            this.fetchData();
        });
    }

    restartStack(name: string) {
        this.statusMessage = `⏳ Reiniciando Stack ${name}...`;
        this.http.post('/api/docker/stack/restart', { name }).subscribe(() => {
            this.statusMessage = `✅ Stack ${name} reiniciado`;
            this.clearStatus();
            this.fetchData();
        });
    }

    hibernateStack(name: string) {
        this.statusMessage = `⏳ Optimizando RAM de Stack ${name}...`;
        this.http.post('/api/docker/stack/hibernate', { name }).subscribe(() => {
            this.statusMessage = `✅ Stack ${name} optimizado`;
            this.clearStatus();
            this.fetchData();
        });
    }

    stopAllIdle() {
        this.openConfirm(
            'Optimización Maestra',
            '¿Quieres reducir la RAM de todos los contenedores inactivos? Se mantendrán encendidos pero con el mínimo consumo (16MB).',
            '⚡',
            () => {
                this.statusMessage = '⏳ Optimizando servicios inactivos...';
                this.http.post('/api/docker/stop-idle', {}).subscribe((res: any) => {
                    this.statusMessage = `✨ ${res.message}`;
                    this.clearStatus();
                    this.fetchData();
                });
            }
        );
    }

    getLogs(container: any) {
        this.selectedContainer = container;
        this.fetchLogs(container.id);
        if (this.logInterval) clearInterval(this.logInterval);
        this.logInterval = setInterval(() => this.fetchLogs(container.id), 3000);
        this.showLogs = true;
    }

    fetchLogs(id: string) {
        this.http.get(`/api/docker/logs/${id}`).subscribe((data: any) => {
            this.currentLogs = data.logs;
        });
    }

    closeLogs() {
        this.showLogs = false;
        this.currentLogs = '';
        this.selectedContainer = null;
        if (this.logInterval) {
            clearInterval(this.logInterval);
            this.logInterval = null;
        }
    }

    initCharts() {
        const commonOptions: any = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: '#30363d' },
                    ticks: { color: '#8b949e', font: { size: 10 } }
                }
            },
            elements: { line: { tension: 0.4 } }
        };

        if (!this.cpuChartRef?.nativeElement || !this.memChartRef?.nativeElement) {
            console.warn('Chart elements not yet available');
            return;
        }

        this.cpuChart = new Chart(this.cpuChartRef.nativeElement, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [{
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    data: this.cpuData,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: commonOptions
        });

        this.memChart = new Chart(this.memChartRef.nativeElement, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [{
                    borderColor: '#238636',
                    backgroundColor: 'rgba(35, 134, 54, 0.1)',
                    data: this.memData,
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: commonOptions
        });
    }

    updateCharts(data: any) {
        if (!this.cpuChart) return;

        const now = new Date().toLocaleTimeString();
        this.labels.push(now);
        this.cpuData.push(parseFloat(data.cpu));
        this.memData.push(parseFloat(data.memory.percent));

        if (this.labels.length > 20) {
            this.labels.shift();
            this.cpuData.shift();
            this.memData.shift();
        }

        this.cpuChart.update();
        this.memChart.update();
    }

    openEditModal(container: any) {
        this.selectedContainer = container;
        // Parse current memory (e.g. "128.50 MB" -> 128)
        this.selectedMemory = parseInt(container.memory) || 128;
        this.selectedCpu = parseInt(container.cpu) || 50;
        this.showEditModal = true;
    }

    updateResources() {
        if (!this.selectedContainer) return;
        this.statusMessage = `Updating resources for ${this.selectedContainer.name}...`;
        this.http.post(`/api/docker/update/${this.selectedContainer.id}`, {
            memoryLimit: this.selectedMemory,
            cpuLimit: this.selectedCpu
        }).subscribe({
            next: () => {
                this.statusMessage = 'Update successful';
                this.showEditModal = false;
                this.fetchData();
                this.clearStatus();
            },
            error: (err) => {
                // Now we capture the real error message from backend
                const errorMsg = err.error?.message || 'Update failed (Docker limit)';
                this.statusMessage = `Error: ${errorMsg}`;
                console.error(err);
            }
        });
    }

    testWhatsApp() {
        this.statusMessage = 'Sending WhatsApp...';
        this.http.post('/api/notify/whatsapp', {
            message: '🚀 Katrix Monitor: Test successful to 5492616557673!'
        }).subscribe({
            next: (ok) => {
                this.statusMessage = ok ? 'WhatsApp Sent!' : 'Failed (Check CallMeBot status)';
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Network error'
        });
    }

    testTelegram() {
        if (!this.tgToken || !this.tgChatId) {
            this.statusMessage = 'Please enter Bot Token and Chat ID';
            return;
        }
        this.statusMessage = 'Sending Telegram...';
        this.http.post('/api/notify/telegram', {
            botToken: this.tgToken,
            chatId: this.tgChatId,
            message: '🚀 Katrix Monitor: Notification system active on Telegram!'
        }).subscribe({
            next: (ok) => {
                this.statusMessage = ok ? 'Telegram Sent!' : 'Failed to send';
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Network error'
        });
    }

    testWhin() {
        this.statusMessage = 'Sending Whin (WhatsApp)...';
        this.http.post('/api/notify/whin', {
            message: '🚀 Katrix Monitor: WhatsApp RapidAPI active!'
        }).subscribe({
            next: (ok) => {
                this.statusMessage = ok ? 'Whin Sent!' : 'Failed (Check Group Setup)';
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Network error'
        });
    }

    optimizeSystem() {
        this.statusMessage = '🚀 Ejecutando MAGIC OPTIMIZE...';
        this.http.post('/api/system/optimize', {}).subscribe({
            next: (res: any) => {
                this.statusMessage = res.success ? res.message : '❌ Error al optimizar';

                // Refresh data multiple times to capture memory release
                this.fetchData();
                setTimeout(() => this.fetchData(), 2000);
                setTimeout(() => this.fetchData(), 5000);

                this.clearStatus();
            },
            error: () => {
                this.statusMessage = '❌ Error de comunicación con el servidor';
                this.clearStatus();
            }
        });
    }

    clearStatus() {
        setTimeout(() => this.statusMessage = '', 3000);
    }

    getRunningCount() {
        return this.docker.filter(c => c.status === 'running').length;
    }

    get filteredDocker() {
        if (!this.searchTerm) return this.docker;
        return this.docker.filter(c =>
            c.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            c.id.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            (c.stack && c.stack.toLowerCase().includes(this.searchTerm.toLowerCase()))
        );
    }

    get groupedDocker() {
        const filtered = this.filteredDocker;
        const groups: { [key: string]: any[] } = {};

        // Sort to keep standalone at the bottom or top
        filtered.forEach(c => {
            const stack = c.stack || 'standalone';
            if (!groups[stack]) groups[stack] = [];
            groups[stack].push(c);
        });
        return groups;
    }

    get stackNames() {
        return Object.keys(this.groupedDocker).sort((a, b) => {
            if (a === 'standalone') return 1;
            if (b === 'standalone') return -1;
            return a.localeCompare(b);
        });
    }

    openLink(url: string) {
        window.open(url, '_blank');
    }
}
