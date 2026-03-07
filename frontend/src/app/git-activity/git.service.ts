import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GitService {
    constructor(private http: HttpClient) { }

    private getHeaders() {
        const token = localStorage.getItem('katrix_token') || 'katrix-secret-token';
        return { headers: new HttpHeaders().set('Authorization', `Bearer ${token}`) };
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
}
