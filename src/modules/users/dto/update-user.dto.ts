import { IsBoolean, IsOptional } from 'class-validator';
import { PartialType, ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  isNewUser?: boolean;

  @ApiProperty()
  @IsOptional()
  @IsBoolean()
  hasMintedCard?: boolean;
}
