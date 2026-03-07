import { Injectable, Logger } from '@nestjs/common';
import { GitActivityGateway } from './git-activity.gateway';
import PQueue from 'p-queue';
import * as child_process from 'child_process';
import * as util from 'util';
import * as https from 'https';
import * as http from 'http';

const execAsync = util.promisify(child_process.exec);

export interface RepoStatus {
    name: string;
    status: 'up to date' | 'updating' | 'error';
    lastCommit: string;
    author: string;
    lastUpdate: string;
    queueSize: number;
    portainerEnabled: boolean;
}

@Injectable()
export class GitActivityService {
    private readonly logger = new Logger(GitActivityService.name);
    private readonly queues = new Map<string, PQueue>();

    constructor(private readonly gateway: GitActivityGateway) { }

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
        return execAsync(command, { cwd, shell: '/bin/bash' });
    }

    private async getCurrentBranch(repo: string): Promise<string> {
        try {
            const { stdout } = await this.execInRepo(repo, 'git rev-parse --abbrev-ref HEAD');
            return stdout.trim() || 'main';
        } catch {
            return 'main';
        }
    }

    // ─── Portainer Webhook ────────────────────────────────────────────────────

    /**
     * Gets the Portainer webhook URL for a given repo.
     * Env var format: PORTAINER_WEBHOOK_<REPO_UPPERCASE_NORMALIZED>=https://...
     * Example: PORTAINER_WEBHOOK_METRICS_DOCKER=https://portainer.example.com/api/webhooks/abc123
     */
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
                // Drain the response body so the socket is properly released
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
            try {
                const { stdout } = await this.execInRepo(repo, 'git log -1 --pretty=format:"%ar|%s|%an"');
                const queueSize = this.getQueue(repo).size;
                const parts = stdout.split('|');
                result.push({
                    name: repo,
                    status: queueSize > 0 || this.getQueue(repo).pending > 0 ? 'updating' : 'up to date',
                    lastCommit: parts[1] || 'No commit',
                    author: parts[2] || 'Unknown',
                    lastUpdate: parts[0] || 'Unknown',
                    queueSize,
                    portainerEnabled: !!this.getPortainerWebhookUrl(repo),
                });
            } catch {
                result.push({
                    name: repo,
                    status: 'error',
                    lastCommit: 'Error/Not Found',
                    author: '-',
                    lastUpdate: '-',
                    queueSize: 0,
                    portainerEnabled: !!this.getPortainerWebhookUrl(repo),
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

            this.logEvent(repo, 'pull completed');
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

            // 1. Git pull
            const branch = await this.getCurrentBranch(repo);
            this.logEvent(repo, `branch: ${branch}`);
            await this.execInRepo(repo, `git fetch && git pull origin ${branch}`);
            this.logEvent(repo, 'pull completed');

            // 2. Restart via Portainer (preferred) or docker compose
            const portainerUrl = this.getPortainerWebhookUrl(repo);
            if (portainerUrl) {
                this.logEvent(repo, 'triggering portainer webhook...');
                await this.triggerPortainerWebhook(repo, portainerUrl);
                this.logEvent(repo, 'portainer stack redeployed');
            } else {
                this.logEvent(repo, 'docker compose restart');
                await this.execInRepo(repo, 'docker compose restart');
                this.logEvent(repo, 'docker restarted');
            }

            this.logEvent(repo, 'deploy completed ✅');
            this.gateway.broadcastEvent('deploy-completed', { repo });
        } catch (e: any) {
            this.logEvent(repo, `deploy error: ${e.message}`);
            this.gateway.broadcastEvent('deploy-error', { repo, error: e.message });
            throw e;
        }
    }

    handleWebhook(repo: string) {
        this.logEvent(repo, `push detected (${repo})`);
        this.gateway.broadcastEvent('push-detected', { repo });
        this.triggerDeploy(repo);
    }
}
