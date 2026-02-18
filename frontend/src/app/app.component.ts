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

    showLogs = false;
    currentLogs = '';
    selectedContainer: any = null;
    statusMessage = '';
    searchTerm = '';
    logInterval: any;
    showTerminal = false;
    showEditModal = false;
    showSettings = false;
    selectedMemory = 128;
    selectedCpu = 50;

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

    constructor(private http: HttpClient) { }

    ngOnInit() {
        this.fetchData();
        this.interval = setInterval(() => this.fetchData(), 5000);
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

    toggleTerminal() {
        this.showTerminal = !this.showTerminal;
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

    restartContainer(id: string) {
        this.statusMessage = `Restarting container ${id}...`;
        this.http.post(`/api/docker/restart/${id}`, {}).subscribe({
            next: () => {
                this.statusMessage = 'Restart successful';
                this.fetchData();
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Restart failed'
        });
    }

    stopContainer(id: string) {
        this.statusMessage = `Stopping container ${id}...`;
        this.http.post(`/api/docker/stop/${id}`, {}).subscribe({
            next: () => {
                this.statusMessage = 'Stop successful';
                this.fetchData();
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Stop failed'
        });
    }

    startContainer(id: string) {
        this.statusMessage = `Starting container ${id}...`;
        this.http.post(`/api/docker/start/${id}`, {}).subscribe({
            next: () => {
                this.statusMessage = 'Start successful';
                this.fetchData();
                this.clearStatus();
            },
            error: () => this.statusMessage = 'Start failed'
        });
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
        if (!this.waPhone || !this.waApiKey) {
            this.statusMessage = 'Please enter Phone and API Key';
            return;
        }
        this.statusMessage = 'Sending WhatsApp...';
        this.http.post('/api/notify/whatsapp', {
            phone: this.waPhone,
            apiKey: this.waApiKey,
            message: '🚀 Katrix Monitor: Test notification successful!'
        }).subscribe({
            next: (ok) => {
                this.statusMessage = ok ? 'WhatsApp Sent!' : 'Failed to send';
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
            c.id.toLowerCase().includes(this.searchTerm.toLowerCase())
        );
    }
}
