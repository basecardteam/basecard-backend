import { IsNotEmpty, IsNumber, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
