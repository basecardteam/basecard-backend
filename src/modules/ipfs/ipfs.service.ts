import { Injectable, Logger } from '@nestjs/common';
import { PinataSDK } from 'pinata';
import { AppConfigService } from '../../app/configs/app-config.service';

export interface IPFSUploadResponse {
  success: boolean;
  id?: string;
  cid?: string;
  url?: string;
  error?: string;
}

/**
 * Generate the filename for a BaseCard image.
 * Change this function to update the naming convention across the entire app.
 * @param address - The wallet address of the user
 */
export function getBaseCardFilename(address: string): string {
  const safeAddress = address.toLowerCase();
  return `BaseCard_${safeAddress}.png`;
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

  /**
   * Delete file by CID - looks up the file ID first, then deletes
   */
  async deleteFileByCid(
    cid: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Query files by CID to get the file ID
      const response = await this.pinata.files.public.list().cid(cid);

      if (!response.files || response.files.length === 0) {
        this.logger.warn(`No file found for CID: ${cid}`);
        return { success: false, error: 'File not found for CID' };
      }

      // Delete using the file ID
      const fileId = response.files[0].id;
      await this.pinata.files.public.delete([fileId]);
      this.logger.log(`Deleted IPFS file with CID: ${cid}, ID: ${fileId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`IPFS delete by CID error for ${cid}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown delete error',
      };
    }
  }

  /**
   * Delete old files by name, keeping only the latest one
   * Useful for cleanup when a user edits their BaseCard and uploads a new image
   * @param filename - The filename to search for (e.g., "BaseCard_0x123...abc.png")
   * @param keepCid - The CID to keep (the latest one from onchain)
   */
  async deleteOldFilesByName(
    filename: string,
    keepCid: string,
  ): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      // Query all files with matching name
      const response = await this.pinata.files.public.list().name(filename);

      if (!response.files || response.files.length === 0) {
        this.logger.debug(`No files found with name: ${filename}`);
        return { success: true, deletedCount: 0 };
      }

      // Filter out the one we want to keep (by CID)
      const filesToDelete = response.files.filter(
        (file) => file.cid !== keepCid,
      );

      if (filesToDelete.length === 0) {
        this.logger.debug(`No old files to delete for: ${filename}`);
        return { success: true, deletedCount: 0 };
      }

      // Delete old files
      const idsToDelete = filesToDelete.map((file) => file.id);
      await this.pinata.files.public.delete(idsToDelete);

      this.logger.log(
        `Deleted ${filesToDelete.length} old IPFS files for: ${filename}`,
      );
      return { success: true, deletedCount: filesToDelete.length };
    } catch (error) {
      this.logger.error(`IPFS cleanup error for ${filename}`, error);
      return {
        success: false,
        deletedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown cleanup error',
      };
    }
  }
}
