import { Controller, Post, Body, Get, UseGuards, HttpException, HttpStatus, Headers, ExecutionContext, Injectable, CanActivate } from '@nestjs/common';
import { GitActivityService } from './git-activity.service';

@Injectable()
export class SimpleAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;
        const pass = process.env.AUTH_PASS || 'katrix2026';
        if (authHeader && authHeader === `Bearer ${pass}`) {
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

    /**
     * POST /api/git/force-clean-redeploy
     * Body: { repo: string, composeProject: string }
     *
     * DevOps nuclear button:
     *   1. Stop + remove all containers of the compose project via Docker API
     *   2. Trigger Portainer webhook to bring them back up clean
     *
     * composeProject = the Docker Compose project name (usually the folder name on the VPS,
     * e.g. 'katrix-monitor-lite'). It must match the `com.docker.compose.project` label.
     */
    @Post('git/force-clean-redeploy')
    @UseGuards(SimpleAuthGuard)
    async forceCleanRedeploy(@Body('repo') repo: string, @Body('composeProject') composeProject: string) {
        if (!repo) throw new HttpException('repo required', HttpStatus.BAD_REQUEST);
        if (!composeProject) throw new HttpException('composeProject required', HttpStatus.BAD_REQUEST);
        const result = await this.gitActivityService.forceCleanRedeploy(composeProject, repo);
        return { status: result.error ? 'error' : 'ok', ...result };
    }
}
