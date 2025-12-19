import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImagesController } from './images.controller';

@Module({
  imports: [HttpModule],
  controllers: [ImagesController],
})
export class ImagesModule {}
