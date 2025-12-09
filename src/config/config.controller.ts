import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

class ContractConfigDto {
  contractAddress: string;
  chainId: number;
}

@Controller('config')
@ApiTags('Config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Get contract configuration',
    description: 'Returns the current contract address and chain ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Contract configuration',
    type: ContractConfigDto,
  })
  getConfig(): ContractConfigDto {
    return {
      contractAddress: this.configService.get<string>(
        'BASECARD_CONTRACT_ADDRESS',
        '',
      ),
      chainId: this.configService.get<number>('CHAIN_ID', 84532),
    };
  }
}
