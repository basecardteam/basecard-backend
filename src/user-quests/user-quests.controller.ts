import { Controller, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserQuestsService } from './user-quests.service';

@ApiTags('user-quests')
@Controller('user-quests')
export class UserQuestsController {
  private readonly logger = new Logger(UserQuestsController.name);

  constructor(private readonly userQuestsService: UserQuestsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all user quest records' })
  @ApiResponse({
    status: 200,
    description: 'List of all user quest records with user and quest details',
  })
  findAll() {
    return this.userQuestsService.findAll();
  }
}
