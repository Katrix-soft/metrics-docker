import { Injectable, Logger } from '@nestjs/common';
import { GitActivityGateway } from './git-activity.gateway';
import PQueue from 'p-queue';
import * as child_process from 'child_process';
import * as util from 'util';
import * as https from 'https';
import * as http from 'http';
import Docker from 'dockerode';

const execAsync = util.promisify(child_process.exec);

const GITHUB_ORG = 'Katrix-soft';

export interface RepoStatus {
    name: string;
    status: 'up to date' | 'updating' | 'error';
    lastCommit: string;
    author: string;
    lastUpdate: string;
    queueSize: number;
    portainerEnabled: boolean;
    source: 'git' | 'github-api';
}

@Injectable()
export class GitActivityService {
    private readonly logger = new Logger(GitActivityService.name);
    private readonly queues = new Map<string, PQueue>();
    private readonly docker: Docker;

    constructor(private readonly gateway: GitActivityGateway) {
        const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
        this.docker = new Docker({ socketPath });
    }

    // ─── Queue Management ─────────────────────────────────────────────────────

    private getQueue(repo: string): PQueue {
        if (!this.queues.has(repo)) {
            this.queues.set(repo, new PQueue({ concurrency: 1 }));
        }
        return this.queues.get(repo)!;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private formatTime(date: Date): string {
        return date.toTimeString().substring(0, 5);
    }

    private logEvent(repo: string, message: string) {
        const time = this.formatTime(new Date());
        const logStr = `${time} ${message}`;
        this.logger.log(`[${repo}] ${logStr}`);
        this.gateway.broadcastLog(repo, logStr);
    }

    private getRepoPath(repo: string): string {
        const base = process.env.REPOS_BASE_PATH || '/repos';
        return `${base}/${repo}`;
    }

    private async execInRepo(repo: string, command: string) {
        const cwd = this.getRepoPath(repo);
        return execAsync(command, { cwd, shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash' });
    }

    private async getCurrentBranch(repo: string): Promise<string> {
        try {
            const { stdout } = await this.execInRepo(repo, 'git rev-parse --abbrev-ref HEAD');
            return stdout.trim() || 'main';
        } catch {
            return 'main';
        }
    }

    // ─── GitHub API Fallback ──────────────────────────────────────────────────

    private githubRequest(path: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                hostname: 'api.github.com',
                path,
                method: 'GET',
                headers: {
                    'User-Agent': 'katrix-monitor',
                    'Accept': 'application/vnd.github.v3+json',
                    ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
                },
            };
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(null); }
                });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
            req.end();
        });
    }

    private async getRepoStatusFromGithubApi(repo: string): Promise<Partial<RepoStatus>> {
        try {
            const data = await this.githubRequest(`/repos/${GITHUB_ORG}/${repo}/commits?per_page=1`);
            if (!data || !Array.isArray(data) || data.length === 0) throw new Error('no data');
            const commit = data[0];
            const message = commit.commit?.message?.split('\n')[0] || 'No message';
            const author = commit.commit?.author?.name || 'Unknown';
            const dateStr = commit.commit?.author?.date;
            const lastUpdate = dateStr ? this.timeAgo(new Date(dateStr)) : 'Unknown';
            return { lastCommit: message, author, lastUpdate, source: 'github-api' };
        } catch {
            return { lastCommit: 'N/A', author: 'N/A', lastUpdate: 'N/A', source: 'github-api' };
        }
    }

    private timeAgo(date: Date): string {
        const secs = Math.floor((Date.now() - date.getTime()) / 1000);
        if (secs < 60) return `${secs}s ago`;
        if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
        if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
        return `${Math.floor(secs / 86400)}d ago`;
    }

    // ─── Portainer Webhook ────────────────────────────────────────────────────

    private getPortainerWebhookUrl(repo: string): string | null {
        const key = `PORTAINER_WEBHOOK_${repo.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
        return process.env[key] || null;
    }

    private async triggerPortainerWebhook(repo: string, webhookUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = new URL(webhookUrl);
            const lib = url.protocol === 'https:' ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + (url.search || ''),
                method: 'POST',
                headers: { 'Content-Length': 0, 'Content-Type': 'application/json' },
            };
            const req = lib.request(options, (res) => {
                res.resume();
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Portainer webhook responded with HTTP ${res.statusCode}`));
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    async getStatus(repoList: string[]): Promise<RepoStatus[]> {
        const result: RepoStatus[] = [];
        for (const repo of repoList) {
            const queueSize = this.getQueue(repo).size;
            const isUpdating = queueSize > 0 || this.getQueue(repo).pending > 0;

            // Try local git first (works on VPS with cloned repos)
            try {
                const { stdout } = await this.execInRepo(repo, 'git log -1 --pretty=format:"%ar|%s|%an"');
                const parts = stdout.split('|');
                result.push({
                    name: repo,
                    status: isUpdating ? 'updating' : 'up to date',
                    lastCommit: parts[1] || 'No commit',
                    author: parts[2] || 'Unknown',
                    lastUpdate: parts[0] || 'Unknown',
                    queueSize,
                    portainerEnabled: !!this.getPortainerWebhookUrl(repo),
                    source: 'git',
                });
            } catch {
                // Fallback: use GitHub API (works without local clone — dev mode or VPS before setup)
                const ghData = await this.getRepoStatusFromGithubApi(repo);
                result.push({
                    name: repo,
                    status: isUpdating ? 'updating' : 'up to date',
                    lastCommit: ghData.lastCommit || 'N/A',
                    author: ghData.author || 'N/A',
                    lastUpdate: ghData.lastUpdate || 'N/A',
                    queueSize,
                    portainerEnabled: !!this.getPortainerWebhookUrl(repo),
                    source: 'github-api',
                });
            }
        }
        return result;
    }

    async triggerPull(repo: string) {
        this.logEvent(repo, 'job added to queue');
        this.gateway.broadcastEvent('queue-job-added', { repo });
        this.getQueue(repo).add(() => this.executePull(repo));
    }

    async triggerDeploy(repo: string) {
        this.logEvent(repo, 'job added to queue');
        this.gateway.broadcastEvent('queue-job-added', { repo });
        this.getQueue(repo).add(() => this.executeDeploy(repo));
    }

    // ─── Private Execution ────────────────────────────────────────────────────

    private async executePull(repo: string) {
        try {
            this.logEvent(repo, 'pull started');
            this.gateway.broadcastEvent('pull-started', { repo });
            const branch = await this.getCurrentBranch(repo);
            this.logEvent(repo, `branch: ${branch}`);
            await this.execInRepo(repo, `git fetch && git pull origin ${branch}`);
            this.logEvent(repo, 'pull completed ✅');
            this.gateway.broadcastEvent('pull-completed', { repo });
        } catch (e: any) {
            this.logEvent(repo, `pull error: ${e.message}`);
            this.gateway.broadcastEvent('deploy-error', { repo, error: e.message });
            throw e;
        }
    }

    private async executeDeploy(repo: string) {
        try {
            this.logEvent(repo, 'deploy started');
            this.gateway.broadcastEvent('deploy-started', { repo });

            const branch = await this.getCurrentBranch(repo);
            this.logEvent(repo, `branch: ${branch}`);
            await this.execInRepo(repo, `git fetch && git pull origin ${branch}`);
            this.logEvent(repo, 'pull completed');

            const portainerUrl = this.getPortainerWebhookUrl(repo);
            if (portainerUrl) {
                this.logEvent(repo, 'triggering portainer webhook...');
                await this.triggerPortainerWebhook(repo, portainerUrl);
                this.logEvent(repo, 'portainer stack redeployed ✅');
            } else {
                this.logEvent(repo, 'running docker compose restart...');
                await this.execInRepo(repo, 'docker compose restart');
                this.logEvent(repo, 'docker restarted ✅');
            }

            this.logEvent(repo, 'deploy completed ✅');
            this.gateway.broadcastEvent('deploy-completed', { repo });
        } catch (e: any) {
            this.logEvent(repo, `deploy error: ${e.message}`);
            this.gateway.broadcastEvent('deploy-error', { repo, error: e.message });
            throw e;
        }
    }

    // ─── Force Clean Redeploy ─────────────────────────────────────────────────

    /**
     * DevOps nuclear option:
     * 1. Find all containers belonging to `composeProject` via Docker label
     * 2. Stop + Remove them (force, with timeout)
     * 3. Trigger Portainer webhook to spin them back up fresh
     * Falls back to Portainer webhook only if no containers found (already clean).
     */
    async forceCleanRedeploy(composeProject: string, repo: string): Promise<{ removed: string[]; webhookTriggered: boolean; error?: string }> {
        const removed: string[] = [];

        this.logEvent(repo, `🔥 force clean redeploy — scanning compose project: ${composeProject}`);
        this.gateway.broadcastEvent('force-redeploy-started', { repo, composeProject });

        try {
            // Step 1: find all containers for this compose project
            const allContainers = await this.docker.listContainers({ all: true });
            const projectContainers = allContainers.filter(c => {
                const project =
                    c.Labels?.['com.docker.compose.project'] ||
                    c.Labels?.['com.docker.stack.namespace'] ||
                    '';
                return project.toLowerCase() === composeProject.toLowerCase();
            });

            this.logEvent(repo, `found ${projectContainers.length} containers to remove`);

            // Step 2: stop + remove each container
            for (const info of projectContainers) {
                const name = info.Names?.[0]?.replace('/', '') || info.Id.substring(0, 12);
                try {
                    const container = this.docker.getContainer(info.Id);
                    if (info.State === 'running') {
                        this.logEvent(repo, `stopping ${name}...`);
                        await Promise.race([
                            container.stop(),
                            new Promise((_, rej) => setTimeout(() => rej(new Error('stop timeout')), 10000)),
                        ]);
                    }
                    this.logEvent(repo, `removing ${name}...`);
                    await container.remove({ force: true, v: false });
                    removed.push(name);
                    this.logEvent(repo, `✅ removed ${name}`);
                } catch (e: any) {
                    this.logEvent(repo, `⚠️ could not remove ${name}: ${e.message}`);
                }
            }

            // Small breathing room so socket state settles
            if (removed.length > 0) await new Promise(r => setTimeout(r, 1500));

            // Step 3: trigger Portainer webhook (or local compose fallback)
            const webhookUrl = this.getPortainerWebhookUrl(repo);
            let webhookTriggered = false;
            if (webhookUrl) {
                try {
                    this.logEvent(repo, `triggering portainer webhook...`);
                    await this.triggerPortainerWebhook(repo, webhookUrl);
                    this.logEvent(repo, `🚀 portainer webhook triggered — stack coming back up`);
                    webhookTriggered = true;
                } catch (e: any) {
                    this.logEvent(repo, `⚠️ webhook error: ${e.message}`);
                }
            } else {
                this.logEvent(repo, `no Portainer webhook — skipping auto-restart (containers removed)`);
            }

            this.gateway.broadcastEvent('force-redeploy-completed', { repo, removed, webhookTriggered });
            return { removed, webhookTriggered };

        } catch (e: any) {
            const msg = e.message || 'Unknown error';
            this.logEvent(repo, `❌ force-clean-redeploy error: ${msg}`);
            this.gateway.broadcastEvent('force-redeploy-error', { repo, error: msg });
            return { removed, webhookTriggered: false, error: msg };
        }
    }

    handleWebhook(repo: string) {
        this.logEvent(repo, `push detected — queuing deploy`);
        this.gateway.broadcastEvent('push-detected', { repo });
        this.triggerDeploy(repo);
    }
}
