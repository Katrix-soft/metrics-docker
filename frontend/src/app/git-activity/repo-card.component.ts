import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-repo-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="repo-card">
      <div class="repo-card-header">
        <div class="repo-name-row">
          <span class="status-dot" [class]="'dot-' + statusClass"></span>
          <span class="repo-name">{{ repo.name }}</span>
        </div>
        <span class="status-badge" [class]="'badge-' + statusClass">{{ repo.status | uppercase }}</span>
      </div>

      <div class="repo-meta">
        <div class="meta-row"><span class="meta-icon">⏱</span> {{ repo.lastUpdate }}</div>
        <div class="meta-row"><span class="meta-icon">👤</span> {{ repo.author }}</div>
        <div class="meta-row commit-msg" [title]="repo.lastCommit">
          <span class="meta-icon">💬</span>
          <span class="commit-text">{{ repo.lastCommit }}</span>
        </div>
      </div>

      <div class="queue-indicator" *ngIf="repo.queueSize > 0">
        <span class="queue-dot"></span> {{ repo.queueSize }} tasks pending
      </div>

      <div class="source-badges">
        <div class="portainer-badge" *ngIf="repo.portainerEnabled">🐳 Portainer</div>
        <div class="api-badge" *ngIf="repo.source === 'github-api'">GH API</div>
      </div>

      <div class="repo-actions">
        <button class="git-btn pull-btn" (click)="onPull.emit(repo.name)" [disabled]="repo.status === 'updating' || forceRunning">
          ⬇ Pull
        </button>
        <button class="git-btn deploy-btn" (click)="onDeploy.emit(repo.name)" [disabled]="repo.status === 'updating' || forceRunning">
          🚀 Deploy
        </button>
      </div>

      <!-- Force Clean Redeploy —— Nuclear option -->
      <div class="force-section">
        <div class="force-header" (click)="forceExpanded = !forceExpanded">
          <span class="force-label">🔥 Force Clean Redeploy</span>
          <span class="force-arrow">{{ forceExpanded ? '▲' : '▼' }}</span>
        </div>
        <div class="force-body" *ngIf="forceExpanded">
          <p class="force-hint">
            Detiene y elimina los contenedores del stack vía Docker API y dispara el webhook de Portainer para un redeploy limpio. Ingresá el nombre del proyecto Compose (label <code>com.docker.compose.project</code>).
          </p>
          <div class="force-input-row">
            <input
              class="force-input"
              [(ngModel)]="composeProject"
              placeholder="ej: katrix-monitor-lite"
              [disabled]="forceRunning"
            />
            <button
              class="git-btn force-btn"
              (click)="triggerForceRedeploy()"
              [disabled]="forceRunning || !composeProject.trim()"
            >
              <span *ngIf="!forceRunning">🔥 Ejecutar</span>
              <span *ngIf="forceRunning" class="spinner">⟳ Corriendo...</span>
            </button>
          </div>
          <div class="force-result" *ngIf="forceResult" [class]="'result-' + forceResult.type">
            {{ forceResult.message }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .repo-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.25rem;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
      position: relative;
      overflow: hidden;
    }
    .repo-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--accent-color), transparent);
      opacity: 0;
      transition: opacity 0.3s;
    }
    .repo-card:hover { transform: translateY(-3px); border-color: var(--accent-color); box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    .repo-card:hover::before { opacity: 1; }

    .repo-card-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .repo-name-row { display: flex; align-items: center; gap: 0.5rem; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; animation: dotBlink 2s infinite; }
    .dot-green { background: #3fb950; box-shadow: 0 0 6px #3fb950; }
    .dot-yellow { background: #d29922; box-shadow: 0 0 6px #d29922; }
    .dot-red { background: #f85149; box-shadow: 0 0 6px #f85149; }
    @keyframes dotBlink { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

    .repo-name { font-weight: 700; font-size: 0.95rem; color: var(--text-color); }
    .status-badge { padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05rem; white-space: nowrap; }
    .badge-green { background: rgba(35,134,54,0.2); color: #3fb950; border: 1px solid rgba(35,134,54,0.4); }
    .badge-yellow { background: rgba(210,153,34,0.2); color: #d29922; border: 1px solid rgba(210,153,34,0.4); }
    .badge-red { background: rgba(218,54,51,0.2); color: #f85149; border: 1px solid rgba(218,54,51,0.4); }

    .repo-meta { display: flex; flex-direction: column; gap: 0.3rem; }
    .meta-row { font-size: 0.78rem; color: var(--secondary-text); display: flex; gap: 0.4rem; align-items: baseline; }
    .meta-icon { font-size: 0.75rem; }
    .commit-msg { overflow: hidden; }
    .commit-text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; flex: 1; }

    .queue-indicator { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #d29922; background: rgba(210,153,34,0.1); border: 1px solid rgba(210,153,34,0.25); border-radius: 6px; padding: 0.3rem 0.7rem; }
    .queue-dot { width: 7px; height: 7px; border-radius: 50%; background: #d29922; animation: dotBlink 1s infinite; }
    .source-badges { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .portainer-badge { font-size: 0.72rem; color: #06b6d4; background: rgba(6,182,212,0.08); border: 1px solid rgba(6,182,212,0.25); border-radius: 6px; padding: 0.2rem 0.6rem; }
    .api-badge { font-size: 0.65rem; color: #8b949e; background: rgba(139,148,158,0.08); border: 1px solid rgba(139,148,158,0.2); border-radius: 6px; padding: 0.2rem 0.5rem; letter-spacing: 0.04rem; }

    .repo-actions { display: flex; gap: 0.5rem; margin-top: auto; }
    .git-btn { flex: 1; padding: 0.45rem 0.5rem; border-radius: 8px; border: 1px solid var(--border-color); background: #0d1117; color: var(--text-color); font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; font-family: inherit; }
    .git-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .git-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .pull-btn:hover:not(:disabled) { background: rgba(88,166,255,0.12); border-color: var(--accent-color); color: var(--accent-color); }
    .deploy-btn:hover:not(:disabled) { background: rgba(35,134,54,0.12); border-color: #3fb950; color: #3fb950; }

    /* ── Force Clean Redeploy ─────────────────────────────── */
    .force-section {
      border-top: 1px solid rgba(248,81,73,0.2);
      padding-top: 0.7rem;
      margin-top: 0.2rem;
    }
    .force-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      padding: 0.2rem 0;
    }
    .force-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #f85149;
      letter-spacing: 0.03rem;
      text-transform: uppercase;
    }
    .force-arrow {
      font-size: 0.65rem;
      color: #f85149;
      opacity: 0.7;
    }
    .force-body {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin-top: 0.5rem;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    .force-hint {
      font-size: 0.72rem;
      color: var(--secondary-text);
      line-height: 1.4;
      margin: 0;
    }
    .force-hint code {
      background: rgba(248,81,73,0.1);
      border: 1px solid rgba(248,81,73,0.2);
      border-radius: 3px;
      padding: 0 3px;
      font-size: 0.68rem;
      color: #f85149;
    }
    .force-input-row {
      display: flex;
      gap: 0.4rem;
    }
    .force-input {
      flex: 1;
      background: #0d1117;
      border: 1px solid rgba(248,81,73,0.3);
      border-radius: 7px;
      color: var(--text-color);
      font-size: 0.78rem;
      padding: 0.4rem 0.6rem;
      outline: none;
      font-family: monospace;
      transition: border-color 0.2s;
    }
    .force-input:focus { border-color: #f85149; }
    .force-input::placeholder { color: #4a5160; }
    .force-input:disabled { opacity: 0.4; }
    .force-btn {
      flex: 0 0 auto;
      padding: 0.4rem 0.8rem;
      background: rgba(248,81,73,0.08);
      border-color: rgba(248,81,73,0.4);
      color: #f85149;
      font-size: 0.78rem;
      white-space: nowrap;
    }
    .force-btn:hover:not(:disabled) {
      background: rgba(248,81,73,0.18);
      border-color: #f85149;
      transform: translateY(-1px);
    }
    .spinner { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .force-result {
      font-size: 0.72rem;
      border-radius: 6px;
      padding: 0.4rem 0.7rem;
      line-height: 1.4;
    }
    .result-success { background: rgba(63,185,80,0.1); border: 1px solid rgba(63,185,80,0.3); color: #3fb950; }
    .result-error { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3); color: #f85149; }
    .result-info { background: rgba(88,166,255,0.1); border: 1px solid rgba(88,166,255,0.3); color: #58a6ff; }
  `]
})
export class RepoCardComponent {
  @Input() repo: any;
  @Output() onPull = new EventEmitter<string>();
  @Output() onDeploy = new EventEmitter<string>();
  @Output() onForceRedeploy = new EventEmitter<{ repo: string; composeProject: string }>();

  forceExpanded = false;
  forceRunning = false;
  composeProject = '';
  forceResult: { type: 'success' | 'error' | 'info'; message: string } | null = null;

  get statusClass() {
    if (this.repo.status === 'updating') return 'yellow';
    if (this.repo.status === 'error') return 'red';
    // 'up to date' from either local git or github api = green
    if (this.repo.status === 'up to date') return 'green';
    return 'red';
  }

  triggerForceRedeploy() {
    if (!this.composeProject.trim() || this.forceRunning) return;
    this.forceResult = null;
    this.onForceRedeploy.emit({ repo: this.repo.name, composeProject: this.composeProject.trim() });
  }

  setForceRunning(running: boolean) {
    this.forceRunning = running;
  }

  setForceResult(type: 'success' | 'error' | 'info', message: string) {
    this.forceResult = { type, message };
  }
}
