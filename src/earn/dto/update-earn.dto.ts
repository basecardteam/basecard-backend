import { PartialType } from '@nestjs/swagger';
import { CreateEarnDto } from './create-earn.dto';

export class UpdateEarnDto extends PartialType(CreateEarnDto) {}
