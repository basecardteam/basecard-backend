import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Images')
@Controller('basecard-images')
export class ImagesController {
  private readonly logger = new Logger(ImagesController.name);

  // Using a reliable public gateway.
  // Alternatives: 'https://ipfs.io/ipfs', 'https://dweb.link/ipfs'
  private readonly GATEWAY_URL = 'https://gateway.pinata.cloud/ipfs';

  constructor(private readonly httpService: HttpService) {}

  @Get(':cid')
  @ApiOperation({ summary: 'Proxy IPFS image' })
  @ApiResponse({ status: 200, description: 'Image stream' })
  async getImage(@Param('cid') cid: string, @Res() res: Response) {
    const url = `${this.GATEWAY_URL}/${cid}`;
    this.logger.debug(`Proxying IPFS image: ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { responseType: 'stream' }),
      );

      // Forward content-type header
      const contentType = response.headers['content-type'];
      if (contentType) {
        res.set('Content-Type', contentType);
      }

      // Pipe the stream to the response
      response.data.pipe(res);
    } catch (error) {
      this.logger.error(`Error fetching IPFS image ${cid}`, error);
      res.status(404).send('Image not found or gateway unavailable');
    }
  }
}
