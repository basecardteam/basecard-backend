import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { EarnService } from './earn.service';
import { CreateEarnDto } from './dto/create-earn.dto';
import { UpdateEarnDto } from './dto/update-earn.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('earn')
@Controller('earn')
export class EarnController {
  constructor(private readonly earnService: EarnService) {}

  @Post()
  create(@Body() createEarnDto: CreateEarnDto) {
    return this.earnService.create(createEarnDto);
  }

  @Get()
  findAll() {
    return this.earnService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.earnService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEarnDto: UpdateEarnDto) {
    return this.earnService.update(id, updateEarnDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.earnService.remove(id);
  }
}
