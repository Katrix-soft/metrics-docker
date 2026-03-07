import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GitDashboardComponent } from './git-dashboard.component';
import { RepoCardComponent } from './repo-card.component';
import { ActivityLogComponent } from './activity-log.component';
import { GitService } from './git.service';
import { WebsocketService } from './websocket.service';

@NgModule({
    imports: [
        CommonModule,
        GitDashboardComponent,
        RepoCardComponent,
        ActivityLogComponent
    ],
    providers: [
        GitService,
        WebsocketService
    ],
    exports: [
        GitDashboardComponent
    ]
})
export class GitActivityModule { }
