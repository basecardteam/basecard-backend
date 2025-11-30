import { Controller, Delete, Query } from '@nestjs/common';
import { IpfsService } from '../services/ipfs.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('ipfs')
@Controller('ipfs')
export class IpfsController {
  constructor(private readonly ipfsService: IpfsService) {}

  @Delete('delete')
  @ApiOperation({ summary: 'Delete file from IPFS' })
  @ApiQuery({ name: 'id', required: true, description: 'IPFS file ID' })
  async delete(@Query('id') id: string) {
    return this.ipfsService.deleteFile(id);
  }
}
