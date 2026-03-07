import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: true })
export class GitActivityGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket) { }
    handleDisconnect(client: Socket) { }

    broadcastLog(repo: string, message: string) {
        this.server.emit('git-log', { repo, message });
    }

    broadcastEvent(event: string, payload: any) {
        this.server.emit(event, payload);
    }
}
