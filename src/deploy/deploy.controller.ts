import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { DeployService, DeployTarget } from './deploy.service';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { UpdateContractDto } from './dto/update-contract.dto';

@ApiTags('deploy')
@Controller('deploy')
export class DeployController {
  private readonly logger = new Logger(DeployController.name);

  constructor(private readonly deployService: DeployService) {}

  @Post('backend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger backend deployment via webhook' })
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
    this.logger.log('Received backend deploy webhook request');

    if (!this.deployService.validateToken(token)) {
      this.logger.warn('Invalid deploy token received');
      throw new UnauthorizedException('Invalid deploy token');
    }

    try {
      await this.deployService.triggerDeploy('backend');
      this.logger.log('Backend deployment triggered successfully');
      return { success: true, message: 'Backend deployment triggered' };
    } catch (error) {
      this.logger.error('Backend deployment failed', error);
      return { success: false, message: 'Backend deployment failed' };
    }
  }

  @Post('miniapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger miniapp deployment via webhook' })
  @ApiHeader({
    name: 'X-Deploy-Token',
    required: true,
    description: 'Deploy secret token',
  })
  @ApiResponse({
    status: 200,
    description: 'Miniapp deployment triggered successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  async triggerMiniappDeploy(
    @Headers('x-deploy-token') token: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log('Received miniapp deploy webhook request');

    if (!this.deployService.validateToken(token)) {
      this.logger.warn('Invalid deploy token received');
      throw new UnauthorizedException('Invalid deploy token');
    }

    try {
      await this.deployService.triggerDeploy('miniapp');
      this.logger.log('Miniapp deployment triggered successfully');
      return { success: true, message: 'Miniapp deployment triggered' };
    } catch (error) {
      this.logger.error('Miniapp deployment failed', error);
      return { success: false, message: 'Miniapp deployment failed' };
    }
  }

  @Post('update-contract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update contract address and restart containers' })
  @ApiHeader({
    name: 'X-Deploy-Token',
    required: true,
    description: 'Deploy secret token',
  })
  @ApiBody({ type: UpdateContractDto })
  @ApiResponse({
    status: 200,
    description: 'Contract address updated and containers restarted',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing token' })
  async updateContract(
    @Headers('x-deploy-token') token: string,
    @Body() dto: UpdateContractDto,
  ): Promise<{
    success: boolean;
    message: string;
    updated: DeployTarget[];
    errors: string[];
  }> {
    this.logger.log(`Received update-contract request: ${dto.address}`);

    if (!this.deployService.validateToken(token)) {
      this.logger.warn('Invalid deploy token received');
      throw new UnauthorizedException('Invalid deploy token');
    }

    const targets = dto.targets || ['backend', 'miniapp'];

    try {
      const result = await this.deployService.updateContractAddress(
        dto.address,
        targets as DeployTarget[],
      );

      const allSuccess = result.errors.length === 0;
      this.logger.log(
        `Contract update completed: ${result.updated.join(', ')}`,
      );

      return {
        success: allSuccess,
        message: allSuccess
          ? `Contract updated to ${dto.address}`
          : `Partial update: ${result.errors.join('; ')}`,
        updated: result.updated,
        errors: result.errors,
      };
    } catch (error) {
      this.logger.error('Contract update failed', error);
      return {
        success: false,
        message: 'Contract update failed',
        updated: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}
