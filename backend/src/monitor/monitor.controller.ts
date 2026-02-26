import { Controller, Get, Post, Param, Body, All, Query } from '@nestjs/common';
import { MonitorService } from './monitor.service';

@Controller('api')
export class MonitorController {
    constructor(private readonly monitorService: MonitorService) { }

    @Get('system')
    async getSystem() {
        return this.monitorService.getSystemStats();
    }

    @Get('docker')
    async getDocker() {
        return this.monitorService.getDockerStats();
    }

    @Post('docker/restart/:id')
    async restartContainer(@Param('id') id: string) {
        return this.monitorService.restartContainer(id);
    }

    @Post('docker/stop/:id')
    async stopContainer(@Param('id') id: string) {
        return this.monitorService.stopContainer(id);
    }

    @Post('docker/start/:id')
    async startContainer(@Param('id') id: string) {
        return this.monitorService.startContainer(id);
    }

    @Get('docker/logs/:id')
    async getLogs(@Param('id') id: string) {
        return this.monitorService.getContainerLogs(id);
    }

    @Post('docker/hibernate/:id')
    async hibernateContainer(@Param('id') id: string) {
        return this.monitorService.hibernateContainer(id);
    }

    @Post('docker/stop-idle')
    async stopAllIdle() {
        return this.monitorService.stopAllIdle();
    }

    @Post('docker/stack/start')
    async startStack(@Body('name') name: string) {
        return this.monitorService.startStack(name);
    }

    @Post('docker/stack/stop')
    async stopStack(@Body('name') name: string) {
        return this.monitorService.stopStack(name);
    }

    @Post('docker/stack/restart')
    async restartStack(@Body('name') name: string) {
        return this.monitorService.restartStack(name);
    }

    @Post('docker/stack/hibernate')
    async hibernateStack(@Body('name') name: string) {
        return this.monitorService.hibernateStack(name);
    }

    @Post('docker/update/:id')
    async updateResources(
        @Param('id') id: string,
        @Body() resources: { memoryLimit: number; cpuLimit: number }
    ) {
        return this.monitorService.updateResources(id, resources.memoryLimit, resources.cpuLimit);
    }

    @Get('2fa/config')
    async get2FAConfig() {
        return this.monitorService.get2FAConfig();
    }

    @Post('2fa/setup')
    async setup2FA() {
        return this.monitorService.setup2FA();
    }

    @Post('2fa/verify')
    async verify2FA(@Body() body: { secret: string; code: string }) {
        return this.monitorService.verifyAndSave2FA(body.secret, body.code);
    }

    @Post('2fa/login')
    async login2FA(@Body() body: { code: string }) {
        const res = await this.monitorService.validate2FALogin(body.code);
        if (res.success) {
            return { success: true, token: 'katrix-secret-token' };
        }
        return { success: false, message: 'Código 2FA inválido' };
    }

    @Post('2fa/disable')
    async disable2FA() {
        return this.monitorService.disable2FA();
    }

    @Post('login')
    async login(@Body() body: { password: string }) {
        // Read password from environment variable AUTH_PASS (set in docker-compose.yml)
        // Falls back to 'katrix2024' if not defined
        const validPassword = process.env.AUTH_PASS || 'katrix2024';
        if (body.password === validPassword) {
            return { success: true, token: 'katrix-secret-token' };
        }
        return { success: false, message: 'Invalid password' };
    }

    @Post('notify/whatsapp')
    async testWhatsApp(@Body() body: { message: string }) {
        return this.monitorService.sendWhatsApp(body.message);
    }

    @Post('notify/telegram')
    async testTelegram(@Body() body: { botToken: string; chatId: string; message: string }) {
        return this.monitorService.sendTelegram(body.botToken, body.chatId, body.message);
    }

    @Post('notify/whin')
    async testWhin(@Body() body: { message: string }) {
        return this.monitorService.sendWhin(body.message);
    }

    @Post('system/optimize')
    async optimizeSystem() {
        return this.monitorService.optimizeSystem();
    }

    @All('webhook/whatsapp')
    async handleWhatsAppWebhook(@Query() query: any, @Body() body: any) {
        // Detailed log to catch what CallMeBot is actually sending
        console.log('[WhatsApp Webhook] Incoming:', {
            query: JSON.stringify(query),
            body: JSON.stringify(body)
        });

        // Some bots use different field names
        const message = (query.text || query.message || body.text || body.message || '').toString();
        const incomingPhone = (query.phone || query.sender || query.from || body.phone || body.sender || body.from || '').toString();

        if (!message) return { ok: true, status: 'Empty message' };

        const authorizedPhone = '5492616557673';
        const cleanIncoming = incomingPhone.replace(/\D/g, '');
        const cleanAuthorized = authorizedPhone.replace(/\D/g, '');

        // If no phone is received, we log it but don't authorized (for security)
        // unless it's a very specific testing scenario
        if (cleanIncoming.includes(cleanAuthorized) || cleanAuthorized.includes(cleanIncoming)) {
            console.log(`[WhatsApp] Authorized match for ${incomingPhone}. Processing: ${message}`);
            const responseMessage = await this.monitorService.processCommand(message);
            await this.monitorService.sendWhatsApp(responseMessage);
        } else {
            console.warn(`[WhatsApp] Unauthorized phone: "${incomingPhone}" (Wanted: ${authorizedPhone})`);
        }
        return { ok: true };
    }
}
