import { IsEthereumAddress, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClaimQuestDto {
  @ApiProperty({
    description: 'User wallet address',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @IsNotEmpty()
  @IsEthereumAddress()
  address: string;

  @ApiProperty({
    description: 'Quest action type to claim',
    example: 'MINT',
  })
  @IsNotEmpty()
  @IsString()
  actionType: string;
}
