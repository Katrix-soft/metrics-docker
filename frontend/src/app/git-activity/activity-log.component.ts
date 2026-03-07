import { Component, Input, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="log-panel">
      <div class="log-header">
        <span class="log-title">
          <span class="log-dot"></span>
          Real-time Activity Log
        </span>
        <button class="log-clear-btn" (click)="clearLogs()">CLEAR</button>
      </div>
      <div #logContainer class="log-body">
        <div *ngIf="logs.length === 0" class="log-empty">⏳ Waiting for activity...</div>
        <div *ngFor="let log of logs" class="log-line">
          <span class="log-repo">[{{ log.repo }}]</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .log-panel {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    .log-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.9rem 1.2rem;
      border-bottom: 1px solid var(--border-color);
    }
    .log-title {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--secondary-text);
      text-transform: uppercase;
      letter-spacing: 0.05rem;
    }
    .log-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #3fb950;
      box-shadow: 0 0 6px #3fb950;
      animation: pulseDot 2s infinite;
    }
    @keyframes pulseDot { 0%,100% {opacity:1;} 50% {opacity:0.4;} }
    .log-clear-btn {
      background: none;
      border: 1px solid var(--border-color);
      color: var(--secondary-text);
      padding: 0.2rem 0.7rem;
      border-radius: 6px;
      font-size: 0.7rem;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      letter-spacing: 0.05rem;
      transition: all 0.2s;
    }
    .log-clear-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }
    .log-body {
      height: 220px;
      overflow-y: auto;
      padding: 0.8rem 1.2rem;
      background: #0a0e16;
      font-family: 'Courier New', monospace;
      font-size: 0.8rem;
    }
    .log-body::-webkit-scrollbar { width: 6px; }
    .log-body::-webkit-scrollbar-track { background: transparent; }
    .log-body::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 3px; }
    .log-empty { color: var(--secondary-text); text-align: center; padding: 2rem 0; }
    .log-line { display: flex; gap: 0.7rem; margin-bottom: 0.3rem; }
    .log-repo { color: var(--accent-color); white-space: nowrap; }
    .log-msg { color: #3fb950; }
  `]
})
export class ActivityLogComponent implements AfterViewChecked {
  @Input() logs: { repo: string, message: string, timestamp: number }[] = [];
  @ViewChild('logContainer') private logContainer!: ElementRef;

  ngAfterViewChecked() {
    try {
      this.logContainer.nativeElement.scrollTop = this.logContainer.nativeElement.scrollHeight;
    } catch { }
  }

  clearLogs() {
    this.logs.length = 0;
  }
}
