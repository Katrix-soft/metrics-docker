import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn'],
        rawBody: true, // required for GitHub webhook HMAC signature validation
    });

    // Enable CORS if needed for dev, but in prod we serve from same port
    app.enableCors();
    app.useWebSocketAdapter(new IoAdapter(app));

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`Katrix Monitor Lite running on port ${port}`);
}
bootstrap();
