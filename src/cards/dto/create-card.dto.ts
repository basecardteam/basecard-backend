import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCardDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nickname: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageURI: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  basename?: string;

  @ApiProperty()
  @IsArray()
  @IsOptional()
  skills?: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  profileImage?: string;

  @ApiProperty()
  @IsObject()
  @IsOptional()
  socials?: Record<string, string>;
}
