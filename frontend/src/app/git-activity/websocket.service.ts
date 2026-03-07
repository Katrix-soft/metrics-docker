import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebsocketService {
    private socket: Socket;

    constructor() {
        // Connect to the same origin, or specify a backend url if different
        this.socket = io({
            transports: ['websocket', 'polling']
        });
    }

    listen(eventName: string): Observable<any> {
        return new Observable((subscriber) => {
            this.socket.on(eventName, (data: any) => {
                subscriber.next(data);
            });
        });
    }
}
