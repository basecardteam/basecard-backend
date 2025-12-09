import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
} from '@nestjs/common';
import { QuestsService } from './quests.service';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { ClaimQuestDto } from './dto/claim-quest.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('quests')
@Controller('quests')
export class QuestsController {
  private readonly logger = new Logger(QuestsController.name);

  constructor(private readonly questsService: QuestsService) {}

  @Post()
  create(@Body() createQuestDto: CreateQuestDto) {
    return this.questsService.create(createQuestDto);
  }

  @Get()
  findAll() {
    return this.questsService.findAll();
  }

  // NOTE: Specific routes must come BEFORE parameterized routes (:id)
  @Get('user/:address')
  @ApiOperation({ summary: 'Get all quests with user status' })
  @ApiResponse({
    status: 200,
    description: 'List of quests with user completion status',
  })
  async findAllForUser(@Param('address') address: string) {
    return this.questsService.findAllForUser(address);
  }

  @Post('claim')
  @ApiOperation({ summary: 'Claim quest reward after on-chain verification' })
  @ApiResponse({
    status: 200,
    description: 'Quest claim result with verification status and points',
  })
  async claimQuest(@Body() claimQuestDto: ClaimQuestDto) {
    this.logger.log(
      `Claim quest request: ${claimQuestDto.address} - ${claimQuestDto.actionType}`,
    );
    return this.questsService.claimQuest(claimQuestDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateQuestDto: UpdateQuestDto) {
    return this.questsService.update(id, updateQuestDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questsService.remove(id);
  }
}
