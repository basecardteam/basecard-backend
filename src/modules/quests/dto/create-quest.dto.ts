import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const PLATFORMS = [
  'FARCASTER',
  'X',
  'BASENAME',
  'APP',
  'GITHUB',
  'LINKEDIN',
  'WEBSITE',
] as const;
type Platform = (typeof PLATFORMS)[number];

const FREQUENCIES = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'ALWAYS'] as const;
type Frequency = (typeof FREQUENCIES)[number];

export class CreateQuestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: PLATFORMS, example: 'APP' })
  @IsIn(PLATFORMS)
  @IsNotEmpty()
  platform: Platform;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  actionType: string;

  @ApiProperty({ enum: FREQUENCIES, example: 'ONCE' })
  @IsIn(FREQUENCIES)
  @IsOptional()
  frequency?: Frequency;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  cooldownSecond?: number;

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  rewardAmount?: number;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
