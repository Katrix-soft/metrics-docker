import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { MonitorModule } from './monitor/monitor.module';
import { GitActivityModule } from './git-activity/git-activity.module';

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
            exclude: ['/api/(.*)'],
        }),
        MonitorModule,
        GitActivityModule,
    ],
})
export class AppModule { }
