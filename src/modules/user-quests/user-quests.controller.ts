import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserQuestsService } from './user-quests.service';
import { ClaimQuestDto } from '../quests/dto/claim-quest.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('user-quests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-quests')
export class UserQuestsController {
  private readonly logger = new Logger(UserQuestsController.name);

  constructor(private readonly userQuestsService: UserQuestsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get all quests with current user status' })
  @ApiResponse({
    status: 200,
    description: 'List of quests with user completion status',
  })
  async findMyQuests(@Request() req: any) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }
    return this.userQuestsService.findAllForUserById(userId);
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verify all pending quests for the current user',
    description:
      'Checks all pending quests and updates their status if conditions are met',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification result with count of verified quests',
  })
  async verifyQuests(@Request() req: any) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    this.logger.log(`Verify quests request for userId=${userId}`);
    return this.userQuestsService.verifyQuestsForUser(userId);
  }

  @Post('claim')
  @ApiOperation({ summary: 'Claim quest reward (only for current user)' })
  @ApiResponse({
    status: 200,
    description: 'Quest claim result with verification status and points',
  })
  async claimQuest(@Request() req: any, @Body() claimQuestDto: ClaimQuestDto) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    this.logger.log(
      `Claim quest request: userId=${userId} - ${claimQuestDto.questId}`,
    );
    return this.userQuestsService.claimQuestByUserId(
      claimQuestDto.questId,
      userId,
    );
  }
}
