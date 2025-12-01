import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../configs/app-config.service';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private supabase: SupabaseClient;
  private readonly bucketName = 'basecard-assets';
  private initializationPromise: Promise<void>;

  constructor(private configService: AppConfigService) {
    const supabaseUrl = this.configService.supabaseUrl;
    const supabaseKey = this.configService.supabaseKey;

    if (supabaseUrl && supabaseKey) {
      this.logger.log('Using Supabase JS Client');
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.initializationPromise = this.ensureBucketExists();
    } else {
      this.logger.warn(
        'Supabase URL or Key not set. Storage operations will fail.',
      );
      this.initializationPromise = Promise.reject(
        new Error('Supabase URL or Key not set'),
      );
    }
  }

  private async ensureBucketExists() {
    try {
      const { data: bucket, error } = await this.supabase.storage.getBucket(
        this.bucketName,
      );

      if (error && error.message.includes('not found')) {
        this.logger.log(`Bucket "${this.bucketName}" not found. Creating...`);
        const { data, error: createError } =
          await this.supabase.storage.createBucket(this.bucketName, {
            public: true,
            allowedMimeTypes: ['image/*'],
            fileSizeLimit: '1MB',
          });

        if (createError) {
          this.logger.error(
            `Failed to create bucket "${this.bucketName}"`,
            createError,
          );
        } else {
          this.logger.log(`Bucket "${this.bucketName}" created successfully.`);
        }
      } else if (error) {
        this.logger.error(`Error checking bucket "${this.bucketName}"`, error);
      } else {
        this.logger.log(`Bucket "${this.bucketName}" exists.`);
      }
    } catch (err) {
      this.logger.error(
        `Unexpected error checking bucket "${this.bucketName}"`,
        err,
      );
    }
  }

  async uploadFile(
    file: File,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      await this.initializationPromise;

      if (!this.supabase) {
        throw new Error('Supabase client not initialized');
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(key, buffer, {
          contentType: contentType,
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(key);

      return publicUrlData.publicUrl;
    } catch (error) {
      this.logger.error('Supabase upload error', error);
      throw error;
    }
  }
}
