import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitService } from './git.service';
import { WebsocketService } from './websocket.service';
import { RepoCardComponent } from './repo-card.component';
import { ActivityLogComponent } from './activity-log.component';
import { Subscription } from 'rxjs';

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
          (onDeploy)="handleDeploy($event)">
        </app-repo-card>
      </div>

      <app-activity-log [logs]="logs"></app-activity-log>
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
  `]
})
export class GitDashboardComponent implements OnInit, OnDestroy {
  repositories: any[] = [];
  logs: { repo: string, message: string, timestamp: number }[] = [];
  private sub: Subscription = new Subscription();

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

    ['pull-completed', 'deploy-completed', 'deploy-error'].forEach(event => {
      this.sub.add(
        this.wsService.listen(event).subscribe(() => this.refresh())
      );
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  refresh() {
    this.gitService.getStatus().subscribe({
      next: (data) => this.repositories = data,
      error: (err) => console.error('Failed to load git status', err)
    });
  }

  handlePull(repo: string) {
    this.gitService.pull(repo).subscribe(() => this.refresh());
  }

  handleDeploy(repo: string) {
    this.gitService.deploy(repo).subscribe(() => this.refresh());
  }
}
