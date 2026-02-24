import { Controller, Get, Post, Param, Body } from '@nestjs/common';
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
        // Simple hardcoded password for Lite version
        if (body.password === 'katrix2024') {
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

    @Post('webhook/whatsapp')
    async handleWhatsAppWebhook(@Body() body: any) {
        // CallMeBot can send data in various fields depending on configuration
        const message = body.text || body.message || body.msg || '';
        const incomingPhone = body.phone || body.sender || '';

        const authorizedPhone = '5492616557673';

        // Check if the message is from the authorized number
        if (incomingPhone.includes(authorizedPhone) || authorizedPhone.includes(incomingPhone)) {
            const responseMessage = await this.monitorService.processCommand(message);
            await this.monitorService.sendWhatsApp(responseMessage);
        }
        return { ok: true };
    }
}
