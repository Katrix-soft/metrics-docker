import { Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { HistoryService } from './history.service';
import { UptimeService } from './uptime.service';

@Module({
    controllers: [MonitorController],
    providers: [MonitorService, HistoryService, UptimeService],
    exports: [MonitorService, HistoryService, UptimeService],
})
export class MonitorModule { }
