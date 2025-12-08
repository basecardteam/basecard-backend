import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DeployService } from './deploy.service';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';

@ApiTags('deploy')
@Controller('deploy')
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(private readonly deployService: DeployService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger deployment via webhook' })
  @ApiHeader({
    name: 'X-Deploy-Token',
    required: true,
    description: 'Deploy secret token',
  })
  @ApiResponse({
    status: 200,
    description: 'Deployment triggered successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  async triggerDeploy(
    @Headers('x-deploy-token') token: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log('Received deploy webhook request');

    if (!this.deployService.validateToken(token)) {
      this.logger.warn('Invalid deploy token received');
      throw new UnauthorizedException('Invalid deploy token');
    }

    try {
      await this.deployService.triggerDeploy();
      this.logger.log('Deployment triggered successfully');
      return { success: true, message: 'Deployment triggered' };
    } catch (error) {
      this.logger.error('Deployment failed', error);
      return { success: false, message: 'Deployment failed' };
    }
  }
}
