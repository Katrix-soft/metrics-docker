import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitService } from './git.service';
import { WebsocketService } from './websocket.service';
import { RepoCardComponent } from './repo-card.component';
import { ActivityLogComponent } from './activity-log.component';
import { Subscription } from 'rxjs';

// ─── Repo → URL mapping ────────────────────────────────────────────────────
// Agregá o modificá las URLs según tu dominio
const REPO_URLS: Record<string, string> = {
  'landingdj': 'https://dj.katrix.com.ar',
  'metrics-docker': 'https://metricas.katrix.com.ar',
  'erp-eana': 'https://app.katrix.com.ar',
  'landing-k': 'https://katrix.com.ar',
  'Landing-Katrix-16-07': 'https://katrix.com.ar'
};

export interface DeployToast {
  id: string;
  repo: string;
  status: 'deploying' | 'success' | 'error';
  url?: string;
  message?: string;
  dismissing?: boolean;
}

@Component({
  selector: 'app-git-dashboard',
  standalone: true,
  imports: [CommonModule, RepoCardComponent, ActivityLogComponent],
  template: `
    <div class="git-dashboard">
      <div class="git-dash-header">
        <div class="git-dash-title">
          <span style="color: var(--accent-color); font-size: 1.2rem;">⎇</span>
          DEVOPS GIT ACTIVITY
          <span class="repo-count">{{ repositories.length }} repos</span>
        </div>
        <button class="pause-btn" (click)="refresh()">↻ Refresh</button>
      </div>

      <div class="repos-grid">
        <app-repo-card
          *ngFor="let repo of repositories"
          [repo]="repo"
          (onPull)="handlePull($event)"
          (onDeploy)="handleDeploy($event)"
          (onForceRedeploy)="handleForceRedeploy($event, card)"
          #card>
        </app-repo-card>
      </div>

      <app-activity-log [logs]="logs"></app-activity-log>
    </div>

    <!-- ── Toast Notifications ─────────────────────────────────────────── -->
    <div class="toast-container">
      <div
        *ngFor="let toast of toasts"
        class="deploy-toast"
        [class.toast-deploying]="toast.status === 'deploying'"
        [class.toast-success]="toast.status === 'success'"
        [class.toast-error]="toast.status === 'error'"
        [class.toast-dismissing]="toast.dismissing"
      >
        <!-- Close button -->
        <button class="toast-close" (click)="dismissToast(toast.id)">✕</button>

        <!-- Icon + Repo name -->
        <div class="toast-header">
          <span class="toast-icon">
            <span *ngIf="toast.status === 'deploying'" class="spin">⟳</span>
            <span *ngIf="toast.status === 'success'">🚀</span>
            <span *ngIf="toast.status === 'error'">❌</span>
          </span>
          <div class="toast-title-block">
            <span class="toast-repo">{{ toast.repo }}</span>
            <span class="toast-label" *ngIf="toast.status === 'deploying'">Deploying...</span>
            <span class="toast-label success-label" *ngIf="toast.status === 'success'">Deploy completado</span>
            <span class="toast-label error-label" *ngIf="toast.status === 'error'">Deploy fallido</span>
          </div>
        </div>

        <!-- Progress bar while deploying -->
        <div class="toast-progress" *ngIf="toast.status === 'deploying'">
          <div class="toast-progress-bar"></div>
        </div>

        <!-- URL link on success -->
        <a
          *ngIf="toast.status === 'success' && toast.url"
          class="toast-url"
          [href]="toast.url"
          target="_blank"
          rel="noopener"
        >
          🌐 {{ toast.url }}
          <span class="toast-url-arrow">↗</span>
        </a>

        <!-- Error message -->
        <div class="toast-error-msg" *ngIf="toast.status === 'error' && toast.message">
          {{ toast.message }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    .git-dashboard {
      margin-bottom: 2rem;
    }
    .git-dash-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .git-dash-title {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--secondary-text);
      text-transform: uppercase;
      letter-spacing: 0.08rem;
    }
    .repo-count {
      background: rgba(88,166,255,0.1);
      color: var(--accent-color);
      border: 1px solid rgba(88,166,255,0.25);
      border-radius: 20px;
      padding: 0.1rem 0.6rem;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .repos-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.2rem;
      margin-bottom: 1.5rem;
    }

    /* ── Toast Container ──────────────────────────────────────────────── */
    .toast-container {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      pointer-events: none;
      max-width: 340px;
      width: 100%;
    }

    .deploy-toast {
      pointer-events: all;
      border-radius: 14px;
      padding: 1rem 1.1rem 0.9rem;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid transparent;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      animation: toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .toast-dismissing {
      animation: toastSlideOut 0.3s ease forwards !important;
    }

    @keyframes toastSlideIn {
      from { opacity: 0; transform: translateX(110%) scale(0.9); }
      to   { opacity: 1; transform: translateX(0)   scale(1);   }
    }
    @keyframes toastSlideOut {
      from { opacity: 1; transform: translateX(0) scale(1); max-height: 200px; }
      to   { opacity: 0; transform: translateX(110%) scale(0.9); max-height: 0; padding: 0; margin: 0; }
    }

    /* Status colors */
    .toast-deploying {
      background: rgba(13,17,23,0.95);
      border-color: rgba(88,166,255,0.3);
    }
    .toast-success {
      background: rgba(13,23,17,0.97);
      border-color: rgba(63,185,80,0.4);
    }
    .toast-error {
      background: rgba(23,13,13,0.97);
      border-color: rgba(248,81,73,0.4);
    }

    /* Close */
    .toast-close {
      position: absolute;
      top: 0.55rem;
      right: 0.65rem;
      background: none;
      border: none;
      color: #8b949e;
      font-size: 0.75rem;
      cursor: pointer;
      padding: 0.1rem 0.25rem;
      border-radius: 4px;
      line-height: 1;
      transition: color 0.15s;
    }
    .toast-close:hover { color: #f0f6fc; }

    /* Header */
    .toast-header {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding-right: 1.2rem;
    }
    .toast-icon {
      font-size: 1.3rem;
      flex-shrink: 0;
      line-height: 1;
    }
    .spin {
      display: inline-block;
      animation: spin 0.9s linear infinite;
      color: #58a6ff;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .toast-title-block {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .toast-repo {
      font-size: 0.92rem;
      font-weight: 700;
      color: #f0f6fc;
      font-family: 'JetBrains Mono', monospace, sans-serif;
    }
    .toast-label {
      font-size: 0.72rem;
      color: #8b949e;
      font-weight: 500;
    }
    .success-label { color: #3fb950; }
    .error-label   { color: #f85149; }

    /* Progress bar */
    .toast-progress {
      height: 3px;
      background: rgba(88,166,255,0.15);
      border-radius: 2px;
      overflow: hidden;
    }
    .toast-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #58a6ff, #a371f7, #58a6ff);
      background-size: 200% 100%;
      animation: progressFlow 1.4s linear infinite;
      border-radius: 2px;
      width: 100%;
    }
    @keyframes progressFlow {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }

    /* URL link */
    .toast-url {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.78rem;
      font-weight: 600;
      color: #3fb950;
      text-decoration: none;
      background: rgba(63,185,80,0.08);
      border: 1px solid rgba(63,185,80,0.25);
      border-radius: 8px;
      padding: 0.45rem 0.7rem;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .toast-url:hover {
      background: rgba(63,185,80,0.16);
      border-color: rgba(63,185,80,0.5);
    }
    .toast-url-arrow {
      flex-shrink: 0;
      font-size: 0.85rem;
    }

    /* Error message */
    .toast-error-msg {
      font-size: 0.73rem;
      color: #f85149;
      background: rgba(248,81,73,0.07);
      border: 1px solid rgba(248,81,73,0.2);
      border-radius: 6px;
      padding: 0.35rem 0.6rem;
      line-height: 1.4;
    }
  `]
})
export class GitDashboardComponent implements OnInit, OnDestroy {
  repositories: any[] = [];
  logs: { repo: string, message: string, timestamp: number }[] = [];
  toasts: DeployToast[] = [];
  private sub: Subscription = new Subscription();
  private toastTimers = new Map<string, any>();

  constructor(
    private gitService: GitService,
    private wsService: WebsocketService
  ) { }

  ngOnInit() {
    this.refresh();

    this.sub.add(
      this.wsService.listen('git-log').subscribe((data) => {
        this.logs.push(data);
        if (this.logs.length > 100) this.logs.shift();
      })
    );

    // ── Deploy WebSocket events ──────────────────────────────────────────
    this.sub.add(
      this.wsService.listen('deploy-completed').subscribe((data: any) => {
        const repo = data?.repo;
        if (repo) this.updateToast(repo, 'success');
        this.refresh();
      })
    );

    this.sub.add(
      this.wsService.listen('pull-completed').subscribe(() => this.refresh())
    );

    this.sub.add(
      this.wsService.listen('deploy-error').subscribe((data: any) => {
        const repo = data?.repo;
        const error = data?.error || 'Error desconocido';
        if (repo) this.updateToast(repo, 'error', error);
        this.refresh();
      })
    );

    this.sub.add(
      this.wsService.listen('force-redeploy-completed').subscribe(() => this.refresh())
    );
    this.sub.add(
      this.wsService.listen('force-redeploy-error').subscribe(() => this.refresh())
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.toastTimers.forEach(t => clearTimeout(t));
  }

  refresh() {
    this.gitService.getStatus().subscribe({
      next: (data) => this.repositories = data,
      error: (err) => console.error('Failed to load git status', err)
    });
  }

  // ── Toast helpers ────────────────────────────────────────────────────────

  private addToast(repo: string): string {
    const id = `${repo}-${Date.now()}`;
    // Remove existing toast for same repo (avoid duplicates)
    this.toasts = this.toasts.filter(t => t.repo !== repo);
    this.toasts.push({ id, repo, status: 'deploying' });
    return id;
  }

  private updateToast(repo: string, status: 'success' | 'error', message?: string) {
    const toast = this.toasts.find(t => t.repo === repo);
    if (!toast) return;
    toast.status = status;
    toast.url = status === 'success' ? (REPO_URLS[repo] ?? undefined) : undefined;
    toast.message = message;

    // Auto-dismiss: success after 7s, error after 12s
    const delay = status === 'success' ? 7000 : 12000;
    const timer = setTimeout(() => this.dismissToast(toast.id), delay);
    this.toastTimers.set(toast.id, timer);
  }

  dismissToast(id: string) {
    const toast = this.toasts.find(t => t.id === id);
    if (!toast || toast.dismissing) return;
    toast.dismissing = true;
    if (this.toastTimers.has(id)) {
      clearTimeout(this.toastTimers.get(id));
      this.toastTimers.delete(id);
    }
    // Remove from DOM after animation
    setTimeout(() => {
      this.toasts = this.toasts.filter(t => t.id !== id);
    }, 310);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  handlePull(repo: string) {
    this.gitService.pull(repo).subscribe(() => this.refresh());
  }

  handleDeploy(repo: string) {
    this.addToast(repo);
    this.gitService.deploy(repo).subscribe({
      // Note: WebSocket events (deploy-completed / deploy-error) update the toast
      error: (err) => this.updateToast(repo, 'error', err.error?.message || err.message || 'Error')
    });
  }

  handleForceRedeploy(event: { repo: string; composeProject: string }, card: RepoCardComponent) {
    card.setForceRunning(true);
    card.setForceResult('info', '⟳ Eliminando contenedores y disparando webhook...');

    this.gitService.forceCleanRedeploy(event.repo, event.composeProject).subscribe({
      next: (res) => {
        card.setForceRunning(false);
        if (res.error) {
          card.setForceResult('error', `❌ Error: ${res.error}`);
        } else {
          const removed = res.removed?.length
            ? `Eliminados: ${res.removed.join(', ')}. `
            : 'No había contenedores activos. ';
          const webhook = res.webhookTriggered
            ? '🚀 Portainer webhook disparado — stack levantando.'
            : '⚠️ Sin webhook configurado. Contenedores eliminados.';
          card.setForceResult('success', removed + webhook);
          setTimeout(() => this.refresh(), 3000);
        }
      },
      error: (err) => {
        card.setForceRunning(false);
        card.setForceResult('error', `❌ ${err.error?.message || err.message || 'Error desconocido'}`);
      }
    });
  }
}
