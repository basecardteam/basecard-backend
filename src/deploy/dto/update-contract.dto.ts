import { IsString, IsOptional, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateContractDto {
  @ApiProperty({
    description: 'New contract address',
    example: '0x15cfaadaca7abd546c0c85880fd31da5c03ada24',
  })
  @IsString()
  address: string;

  @ApiProperty({
    description: 'Target services to update and restart',
    example: ['backend', 'miniapp'],
    default: ['backend', 'miniapp'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['backend', 'miniapp'], { each: true })
  targets?: ('backend' | 'miniapp')[];
}
