import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsObject,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBasecardDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'nickname은 필수 항목입니다' })
  @MinLength(1, { message: 'nickname은 비어있을 수 없습니다' })
  nickname: string;

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'role은 필수 항목입니다' })
  @MinLength(1, { message: 'role은 비어있을 수 없습니다' })
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
