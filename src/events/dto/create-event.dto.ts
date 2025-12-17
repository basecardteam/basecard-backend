import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsObject,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEventDto {
  @ApiProperty({ example: '0x123...' })
  @IsString()
  @IsNotEmpty()
  transactionHash: string;

  @ApiProperty({ example: 123456 })
  @IsNumber()
  @IsNotEmpty()
  blockNumber: number;

  @ApiProperty({ example: '0xabc...' })
  @IsString()
  @IsNotEmpty()
  blockHash: string;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @IsNotEmpty()
  logIndex: number;

  @ApiProperty({ example: 'MintBaseCard' })
  @IsString()
  @IsNotEmpty()
  eventName: string;

  @ApiProperty({ example: { user: '0x...', tokenId: 1 } })
  @IsObject()
  @IsNotEmpty()
  args: Record<string, any>;

  // TX Receipt Details
  @ApiPropertyOptional({ example: '0x...' })
  @IsString()
  @IsOptional()
  fromAddress?: string;

  @ApiPropertyOptional({ example: '0x...' })
  @IsString()
  @IsOptional()
  toAddress?: string;

  @ApiPropertyOptional({ example: '21000' })
  @IsString()
  @IsOptional()
  gasUsed?: string;

  @ApiPropertyOptional({ example: '1000000000' })
  @IsString()
  @IsOptional()
  effectiveGasPrice?: string;

  @ApiPropertyOptional({ example: 'success' })
  @IsString()
  @IsOptional()
  txStatus?: string;
}
