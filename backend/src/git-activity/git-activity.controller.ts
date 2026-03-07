import { Controller, Post, Body, Get, UseGuards, HttpException, HttpStatus, Headers, ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { GitActivityService } from './git-activity.service';

@Injectable()
export class SimpleAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader === 'Bearer katrix-secret-token') {
            return true;
        }
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
}


@Controller('api')
export class GitActivityController {
    constructor(private readonly gitActivityService: GitActivityService) { }

    @Post('github/webhook')
    handleWebhook(
        @Body() payload: any,
        @Headers('x-github-event') event: string,
    ) {
        // No secret validation — open endpoint, secured by obscurity of the URL
        // Only handle push events
        if (event && event !== 'push') {
            return { status: 'ignored', event };
        }

        if (payload && payload.repository && payload.repository.name) {
            this.gitActivityService.handleWebhook(payload.repository.name);
            return { status: 'acknowledged', repo: payload.repository.name };
        }

        throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }

    @Post('git/pull')
    @UseGuards(SimpleAuthGuard)
    handlePull(@Body('repo') repo: string) {
        if (!repo) throw new HttpException('repo required', HttpStatus.BAD_REQUEST);
        this.gitActivityService.triggerPull(repo);
        return { status: 'pull triggered' };
    }

    @Post('git/deploy')
    @UseGuards(SimpleAuthGuard)
    handleDeploy(@Body('repo') repo: string) {
        if (!repo) throw new HttpException('repo required', HttpStatus.BAD_REQUEST);
        this.gitActivityService.triggerDeploy(repo);
        return { status: 'deploy triggered' };
    }

    @Get('git/status')
    @UseGuards(SimpleAuthGuard)
    async getStatus() {
        // Default list = real Katrix-soft org repos (override with REPOSITORIES env var, comma-separated)
        const defaultRepos = [
            'landingdj',
            'metrics-docker',
            'erp-eana',
            'landing-k',
            'Landing-Katrix-16-07',
            'Login-Dashboard',
        ];
        const repositories = process.env.REPOSITORIES
            ? process.env.REPOSITORIES.split(',').map(r => r.trim())
            : defaultRepos;
        return this.gitActivityService.getStatus(repositories);
    }
}
