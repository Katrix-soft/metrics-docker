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

        // Full dump — critical for debugging CallMeBot format
        console.log('[WA Webhook] ===== INCOMING =====');
        console.log('[WA Webhook] Query:', JSON.stringify(query));
        console.log('[WA Webhook] Body:', JSON.stringify(body));
        console.log('[WA Webhook] ==================');

        // Extract message — try every possible field name CallMeBot might use
        const rawMessage = (
            query.text ?? query.message ?? query.msg ?? query.content ?? query.Body ??
            body.text ?? body.message ?? body.msg ?? body.content ?? body.Body ?? ''
        ).toString().trim();

        // Extract phone — try every possible field name
        const rawPhone = (
            query.phone ?? query.sender ?? query.from ?? query.number ?? query.msisdn ?? query.wa_id ??
            body.phone ?? body.sender ?? body.from ?? body.number ?? body.msisdn ?? body.wa_id ?? ''
        ).toString();

        console.log(`[WA Webhook] Message: "${rawMessage}" | Phone: "${rawPhone}"`);

        if (!rawMessage) {
            console.log('[WA Webhook] Empty message — ignored.');
            return { ok: true, status: 'empty' };
        }

        const authorizedPhone = '5492616557673';
        const cleanIncoming = rawPhone.replace(/\D/g, '');
        const cleanAuthorized = authorizedPhone.replace(/\D/g, '');

        // Flexible phone matching:
        // 1. No phone provided → trust it (webhook URL is already a secret)
        // 2. Exact match
        // 3. Last-10-digits match (handles country code variations like 549... vs 54...)
        const noPhoneProvided = cleanIncoming.length === 0;
        const exactMatch = cleanIncoming === cleanAuthorized;
        const suffixMatch = cleanIncoming.length >= 8 &&
            (cleanAuthorized.endsWith(cleanIncoming.slice(-10)) ||
                cleanIncoming.endsWith(cleanAuthorized.slice(-10)));

        const isAuthorized = noPhoneProvided || exactMatch || suffixMatch;

        if (isAuthorized) {
            console.log(`[WA Webhook] ✅ Authorized (noPhone:${noPhoneProvided} exact:${exactMatch} suffix:${suffixMatch}). Processing: "${rawMessage}"`);
            try {
                const responseMessage = await this.monitorService.processCommand(rawMessage);
                await this.monitorService.sendWhatsApp(responseMessage);
                console.log(`[WA Webhook] ✅ Response sent.`);
            } catch (err) {
                console.error('[WA Webhook] ❌ Error processing command:', err);
            }
        } else {
            console.warn(`[WA Webhook] ❌ Unauthorized phone: "${cleanIncoming}" (expected: "${cleanAuthorized}")`);
        }

        return { ok: true };
    }
}
