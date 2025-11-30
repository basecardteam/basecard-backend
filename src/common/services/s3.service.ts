import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AppConfigService } from '../configs/app-config.service';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: AppConfigService) {
    const region = this.configService.awsRegion;
    const accessKeyId = this.configService.awsAccessKeyId;
    const secretAccessKey = this.configService.awsSecretAccessKey;
    this.bucketName = this.configService.awsS3BucketName || '';

    if (accessKeyId && secretAccessKey && this.bucketName) {
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } else {
      this.logger.warn(
        'AWS credentials or bucket name not set. S3 uploads will fail.',
      );
    }
  }

  async uploadFile(
    file: File,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: 'public-read', // Adjust based on bucket policy
        }),
      );

      // Construct public URL (assuming standard S3 URL format)
      // For CloudFront or other setups, this might need adjustment
      const region = this.configService.awsRegion;
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
    } catch (error) {
      this.logger.error('S3 upload error', error);
      throw error;
    }
  }
}
