import { PartialType } from '@nestjs/swagger';
import { CreateMintDto } from './create-mint.dto';

export class UpdateMintDto extends PartialType(CreateMintDto) {}
