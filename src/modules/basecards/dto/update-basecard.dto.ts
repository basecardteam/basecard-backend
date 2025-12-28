import { PartialType } from '@nestjs/swagger';
import { CreateBasecardDto } from './create-basecard.dto';

export class UpdateBasecardDto extends PartialType(CreateBasecardDto) {}

export interface UpdateBaseCardResponse {
  card_data: {
    imageUri: string;
    nickname: string;
    role: string;
    bio: string;
  };
  social_keys: string[];
  social_values: string[];
  token_id: number;
  needs_rollback: boolean; // true if new image was uploaded (should call rollback on tx reject)
}
