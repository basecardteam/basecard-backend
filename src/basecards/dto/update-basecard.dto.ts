import { PartialType } from '@nestjs/swagger';
import { CreateBasecardDto } from './create-basecard.dto';

export class UpdateBasecardDto extends PartialType(CreateBasecardDto) {}
