import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMintDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

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
  @IsOptional()
  baseName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  defaultProfileUrl?: string;

  @ApiProperty()
  @IsOptional()
  skills?: string[] | string; // FormData might send as string or array

  @ApiProperty()
  @IsOptional()
  socials?: string; // FormData sends JSON string
}
