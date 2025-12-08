import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export type DeployTarget = 'backend' | 'miniapp';

@Injectable()
export class DeployService implements OnModuleInit {
  private readonly logger = new Logger(DeployService.name);
  private deployToken: string;

  // Deploy paths for each target
  private readonly deployPaths: Record<DeployTarget, string> = {
    backend: '/home/basecard/src/basecard-backend',
    miniapp: '/home/basecard/src/basecard-miniapp',
  };

  // Env file names for each target
  private readonly envFiles: Record<DeployTarget, string> = {
    backend: '.env',
    miniapp: '.env.local',
  };

  // Contract address env key for each target
  private readonly contractEnvKeys: Record<DeployTarget, string> = {
    backend: 'BASECARD_CONTRACT_ADDRESS',
    miniapp: 'NEXT_PUBLIC_BASECARD_CONTRACT_ADDRESS',
  };

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

  /**
   * Update contract address in .env file for a target
   */
  async updateContractAddress(
    address: string,
    targets: DeployTarget[] = ['backend', 'miniapp'],
  ): Promise<{ updated: DeployTarget[]; errors: string[] }> {
    const updated: DeployTarget[] = [];
    const errors: string[] = [];

    for (const target of targets) {
      const envPath = path.join(
        this.deployPaths[target],
        this.envFiles[target],
      );
      const envKey = this.contractEnvKeys[target];

      try {
        // Read existing .env file
        let envContent = await fs.readFile(envPath, 'utf-8');

        // Check if the key exists
        const regex = new RegExp(`^${envKey}=.*$`, 'm');

        if (regex.test(envContent)) {
          // Update existing key
          envContent = envContent.replace(regex, `${envKey}=${address}`);
        } else {
          // Add new key
          envContent += `\n${envKey}=${address}\n`;
        }

        // Write back
        await fs.writeFile(envPath, envContent, 'utf-8');
        this.logger.log(`Updated ${envKey} in ${envPath}`);
        updated.push(target);
      } catch (error) {
        const msg = `Failed to update ${target}: ${error instanceof Error ? error.message : error}`;
        this.logger.error(msg);
        errors.push(msg);
      }
    }

    // Restart updated containers
    for (const target of updated) {
      try {
        await this.restartContainer(target);
      } catch (error) {
        errors.push(
          `Failed to restart ${target}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return { updated, errors };
  }

  /**
   * Restart container for a target using docker compose
   */
  async restartContainer(target: DeployTarget): Promise<void> {
    const deployPath = this.deployPaths[target];
    const composeFile = `${deployPath}/docker-compose.prod.yml`;

    this.logger.log(`Restarting ${target} container...`);

    try {
      await execAsync(
        `cd ${deployPath} && docker compose -f docker-compose.prod.yml restart`,
        { timeout: 30000 },
      );
      this.logger.log(`${target} container restarted successfully`);
    } catch (error) {
      this.logger.error(`Failed to restart ${target}`, error);
      throw error;
    }
  }

  async triggerDeploy(target: DeployTarget = 'backend'): Promise<void> {
    this.logger.log(`Starting ${target} deployment...`);

    const deployPath = this.deployPaths[target];
    const scriptPath = `${deployPath}/scripts/deploy.sh`;
    const logFile = `/tmp/${target}-deploy.log`;

    try {
      // Run deploy script in detached mode so it continues after response
      const { stdout, stderr } = await execAsync(
        `nohup ${scriptPath} > ${logFile} 2>&1 &`,
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
        this.logger.log(`${target} deploy script started in background`);
        return;
      }
      this.logger.error(`Failed to start ${target} deploy script`, error);
      throw error;
    }
  }
}
