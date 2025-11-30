import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Logger,
} from '@nestjs/common';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';

@Controller('cards')
export class CardsController {
  private readonly logger = new Logger(CardsController.name);

  constructor(private readonly cardsService: CardsService) {}

  @Post()
  async create(@Body() createCardDto: CreateCardDto) {
    this.logger.log(`Creating card for address: ${createCardDto.address}`);
    return this.cardsService.create(createCardDto);
  }

  @Get()
  findAll() {
    return this.cardsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cardsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardsService.update(id, updateCardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cardsService.remove(id);
  }

  @Put('card/:address')
  updateTokenId(
    @Param('address') address: string,
    @Body('tokenId') tokenId: number,
  ) {
    return this.cardsService.updateTokenId(address, tokenId);
  }

  @Delete('card/:address')
  removeByAddress(@Param('address') address: string) {
    return this.cardsService.removeByAddress(address);
  }
}
