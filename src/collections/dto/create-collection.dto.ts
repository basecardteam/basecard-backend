import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  collectorUserId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  collectedCardId: string;
}
