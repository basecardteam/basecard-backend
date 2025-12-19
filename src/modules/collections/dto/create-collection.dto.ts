import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  collectorAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  collectedAddress: string;
}
