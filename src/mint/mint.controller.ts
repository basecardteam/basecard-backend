import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MintService } from './mint.service';
import { CreateMintDto } from './dto/create-mint.dto';
import { ApiConsumes, ApiBody, ApiTags } from '@nestjs/swagger';

@ApiTags('mint')
@Controller()
export class MintController {
  constructor(private readonly mintService: MintService) {}

  @Post('generate')
  @UseInterceptors(FileInterceptor('profileImageFile'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Mint Base Card',
    type: CreateMintDto,
  })
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createMintDto: CreateMintDto,
  ) {
    return this.mintService.mint(file, createMintDto);
  }
}
