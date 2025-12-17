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
    maxRetries = 3,
  ): Promise<IPFSUploadResponse> {
    const group = this.configService.pinataGroup;
    if (!group) {
      return { success: false, error: 'PINATA_GROUP not configured' };
    }

    const file = new File([new Uint8Array(buffer)], filename, {
      type: mimeType,
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`IPFS upload attempt ${attempt}/${maxRetries}...`);
        const upload = await this.pinata.upload.public.file(file).group(group);

        this.logger.log(`IPFS upload successful: ${upload.cid}`);
        return {
          success: true,
          id: upload.id,
          cid: upload.cid,
          url: `https://ipfs.io/ipfs/${upload.cid}`,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `IPFS upload attempt ${attempt} failed: ${lastError.message}`,
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          this.logger.log(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error('IPFS upload failed after all retries', lastError);
    return {
      success: false,
      error: lastError?.message || 'Unknown IPFS upload error after retries',
    };
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
