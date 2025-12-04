import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBasecardDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

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
  @IsObject()
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value;
  })
  socials?: Record<string, string>;

  @ApiProperty({ type: 'string', format: 'binary', required: false })
  profileImageFile: any;
}
