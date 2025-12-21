import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty({ description: 'ID of the BaseCard to collect' })
  @IsString()
  @IsNotEmpty()
  basecardId: string;
}
