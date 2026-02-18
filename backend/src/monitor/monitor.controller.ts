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
}
