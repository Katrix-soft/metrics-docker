import { Controller, Get, Post, Param } from '@nestjs/common';
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
}
