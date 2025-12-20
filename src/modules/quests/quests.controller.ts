import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Logger,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { QuestsService } from './quests.service';
import { CreateQuestDto } from './dto/create-quest.dto';
import { UpdateQuestDto } from './dto/update-quest.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PLATFORMS, ACTION_TYPES, FREQUENCIES } from './quest-types';

// Public decorator to bypass auth
const Public = () => SetMetadata('isPublic', true);

@ApiTags('quests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('quests')
export class QuestsController {
  private readonly logger = new Logger(QuestsController.name);

  constructor(private readonly questsService: QuestsService) {}

  /**
   * Public: Get all active quests (no auth required)
   */
  @Public()
  @Get('active')
  @ApiOperation({ summary: 'Get all active quests (public, no auth)' })
  findAllActive() {
    return this.questsService.findAllActive();
  }

  /**
   * Get available quest types for admin dashboard
   */
  @Get('types')
  @ApiOperation({
    summary: 'Get available platforms, action types and frequencies',
  })
  getQuestTypes() {
    return {
      platforms: PLATFORMS,
      actionTypes: ACTION_TYPES,
      frequencies: FREQUENCIES,
    };
  }

  @Post()
  create(@Body() createQuestDto: CreateQuestDto) {
    return this.questsService.create(createQuestDto);
  }

  @Get()
  findAll() {
    return this.questsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.questsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateQuestDto: UpdateQuestDto) {
    return this.questsService.update(id, updateQuestDto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a quest' })
  activate(@Param('id') id: string) {
    return this.questsService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a quest' })
  deactivate(@Param('id') id: string) {
    return this.questsService.setActive(id, false);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.questsService.remove(id);
  }
}
