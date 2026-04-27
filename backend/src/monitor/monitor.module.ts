import { Module } from '@nestjs/common';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';
import { HistoryService } from './history.service';

@Module({
    controllers: [MonitorController],
    providers: [MonitorService, HistoryService],
    exports: [MonitorService, HistoryService],
})
export class MonitorModule { }
