import { Injectable, Logger } from '@nestjs/common';
import { PinataSDK } from 'pinata';
import { AppConfigService } from '../configs/app-config.service';

export interface IPFSUploadResponse {
  success: boolean;
  id?: string;
  cid?: string;
  url?: string;
  error?: string;
}

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private pinata: PinataSDK;

  constructor(private configService: AppConfigService) {
    const jwt = this.configService.pinataJwt;
    const gateway = this.configService.pinataGateway;

    if (jwt) {
      this.pinata = new PinataSDK({
        pinataJwt: jwt,
        pinataGateway: gateway,
      });
    } else {
      this.logger.warn('PINATA_JWT not set. IPFS uploads will fail.');
    }
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<IPFSUploadResponse> {
    try {
      const group = this.configService.pinataGroup;
      if (!group) {
        throw new Error('PINATA_GROUP not configured');
      }

      const file = new File([new Uint8Array(buffer)], filename, {
        type: mimeType,
      });

      const upload = await this.pinata.upload.public.file(file).group(group);

      return {
        success: true,
        id: upload.id,
        cid: upload.cid,
        url: `https://ipfs.io/ipfs/${upload.cid}`,
      };
    } catch (error) {
      this.logger.error('IPFS upload error', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown IPFS upload error',
      };
    }
  }

  async deleteFile(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.pinata.files.public.delete([id]);
      return { success: true };
    } catch (error) {
      this.logger.error('IPFS delete error', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown delete error',
      };
    }
  }
}
