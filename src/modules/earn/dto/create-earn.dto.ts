import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum EarnType {
  BOUNTY = 'bounty',
  PROJECT = 'project',
  HIRING = 'hiring',
}

export class CreateEarnDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ownerUserId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ enum: EarnType })
  @IsEnum(EarnType)
  @IsNotEmpty()
  type: EarnType;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;
}
