import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { UserQuestsService } from './user-quests.service';
import { ClaimQuestDto, VerifyQuestDto } from '../quests/dto/claim-quest.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('user-quests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-quests')
export class UserQuestsController {
  private readonly logger = new Logger(UserQuestsController.name);

  constructor(private readonly userQuestsService: UserQuestsService) {}

  @Get('user/:address')
  @ApiOperation({ summary: 'Get all quests with user status' })
  @ApiResponse({
    status: 200,
    description: 'List of quests with user completion status',
  })
  async findAllForUser(
    @Param('address') address: string,
    @Query('fid') fid?: number,
  ) {
    return this.userQuestsService.findAllForUser(address, fid);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify manual quest actions (Share, Follow, etc)' })
  @ApiResponse({
    status: 200,
    description: 'Verification result',
  })
  async verifyQuest(@Body() verifyQuestDto: VerifyQuestDto) {
    this.logger.log(`Verify quest request: ${verifyQuestDto.address}`);
    return this.userQuestsService.verifyAllUserQuests(
      verifyQuestDto.address,
      verifyQuestDto.fid,
    );
  }

  @Post('claim')
  @ApiOperation({ summary: 'Claim quest reward after on-chain verification' })
  @ApiResponse({
    status: 200,
    description: 'Quest claim result with verification status and points',
  })
  async claimQuest(@Body() claimQuestDto: ClaimQuestDto) {
    this.logger.log(
      `Claim quest request: ${claimQuestDto.address} - ${claimQuestDto.questId}`,
    );
    return this.userQuestsService.claimQuest(claimQuestDto);
  }
}
