import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['error', 'warn'], // Minimized logging to save CPU/RAM
    });

    // Enable CORS if needed for dev, but in prod we serve from same port
    app.enableCors();

    const port = process.env.PORT || 3000;
    await app.listen(port);
    console.log(`Katrix Monitor Lite running on port ${port}`);
}
bootstrap();
