import { Module } from '@nestjs/common';
import { GitActivityController } from './git-activity.controller';
import { GitActivityService } from './git-activity.service';
import { GitActivityGateway } from './git-activity.gateway';

@Module({
    controllers: [GitActivityController],
    providers: [GitActivityService, GitActivityGateway],
    exports: [GitActivityService],
})
export class GitActivityModule { }
