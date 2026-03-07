import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GitService {
    constructor(private http: HttpClient) { }

    private getHeaders() {
        // Must match AUTH_PASS used by the backend SimpleAuthGuard
        const pass = 'katrix2026';
        return { headers: new HttpHeaders().set('Authorization', `Bearer ${pass}`) };
    }

    getStatus(): Observable<any[]> {
        return this.http.get<any[]>('/api/git/status', this.getHeaders());
    }

    pull(repo: string): Observable<any> {
        return this.http.post('/api/git/pull', { repo }, this.getHeaders());
    }

    deploy(repo: string): Observable<any> {
        return this.http.post('/api/git/deploy', { repo }, this.getHeaders());
    }

    forceCleanRedeploy(repo: string, composeProject: string): Observable<any> {
        return this.http.post('/api/git/force-clean-redeploy', { repo, composeProject }, this.getHeaders());
    }
}
