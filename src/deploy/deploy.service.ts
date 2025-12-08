import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class DeployService implements OnModuleInit {
  private readonly logger = new Logger(DeployService.name);
  private deployToken: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.deployToken =
      this.configService.get<string>('DEPLOY_SECRET_TOKEN') || '';

    if (!this.deployToken) {
      this.logger.warn(
        'DEPLOY_SECRET_TOKEN is not set. Deploy webhook will reject all requests.',
      );
    } else {
      this.logger.log('Deploy webhook initialized');
    }
  }

  validateToken(token: string): boolean {
    if (!this.deployToken) {
      return false;
    }
    return token === this.deployToken;
  }

  async triggerDeploy(): Promise<void> {
    this.logger.log('Starting deployment...');

    try {
      // Run deploy script in detached mode so it continues after response
      const { stdout, stderr } = await execAsync(
        'nohup /app/scripts/deploy.sh > /tmp/deploy.log 2>&1 &',
        { timeout: 5000 }, // Short timeout since we're running in background
      );

      if (stdout) {
        this.logger.log(`Deploy output: ${stdout}`);
      }
      if (stderr) {
        this.logger.warn(`Deploy stderr: ${stderr}`);
      }
    } catch (error) {
      // Ignore timeout errors since script runs in background
      if ((error as any).killed) {
        this.logger.log('Deploy script started in background');
        return;
      }
      this.logger.error('Failed to start deploy script', error);
      throw error;
    }
  }
}
