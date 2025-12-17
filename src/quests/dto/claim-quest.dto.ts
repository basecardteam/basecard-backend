import {
  IsEthereumAddress,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimQuestDto {
  @ApiProperty({
    description: 'User wallet address',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;

  @IsNotEmpty()
  @IsString()
  questId: string;

  @ApiProperty({
    description: 'Farcaster ID (FID) for verification',
    example: 123456,
    required: false,
  })
  @IsOptional()
  fid?: number;
}

export class VerifyQuestDto {
  @ApiProperty({
    description: 'User wallet address',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;

  @ApiProperty({
    description: 'Farcaster ID (FID) for verification',
    example: 123456,
    required: false,
  })
  @IsOptional()
  fid?: number;
}
