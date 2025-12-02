import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { S3Service } from '../src/common/services/s3.service';
import { IpfsService } from '../src/common/services/ipfs.service';
import { ImageService } from '../src/common/services/image.service';
import * as dotenv from 'dotenv';
import { CustomLogger } from '../src/common/logger/custom.logger';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const s3Service = app.get(S3Service);
  const ipfsService = app.get(IpfsService);
  const imageService = app.get(ImageService);

  // Dummy data for testing
  const dummyImageBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 black pixel
  const imageBuffer = Buffer.from(dummyImageBase64, 'base64');
  const filename = 'test-image.png';
  const mimetype = 'image/png';
  let s3Url = '';

  // Create results directory if it doesn't exist
  const resultsDir = path.join(__dirname, '../test/results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  console.log('🚀 Starting Service Tests...');

  try {
    // 1. Read files from samples directory
    const samplesDir = path.join(__dirname, '../test/samples');

    if (fs.existsSync(samplesDir)) {
      const files = fs
        .readdirSync(samplesDir)
        .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file));

      for (const file of files) {
        console.log(`\nProcessing file: ${file} -------------------------`);
        const filePath = path.join(samplesDir, file);
        const fileBuffer = fs.readFileSync(filePath); // Renamed to avoid conflict
        const currentFilename = file; // Renamed to avoid conflict

        if (process.env.IMAGE_SERVICE === 'true') {
          console.log('2️⃣  Testing Image Optimization (For S3)...');
          const optimized = await imageService.optimizeImage(fileBuffer);
          console.log(
            '✅ Optimization Success. MimeType:',
            optimized.mimeType,
            'Base64 Length:',
            optimized.base64.length,
          );

          // Save Optimized Image (S3 version) locally
          const optimizedPath = path.join(
            resultsDir,
            `s3-optimized-${currentFilename}.webp`,
          );
          fs.writeFileSync(
            optimizedPath,
            Buffer.from(optimized.base64, 'base64'),
          );
          console.log(`💾 Saved S3 Optimized Image to: ${optimizedPath}`);

          // Upload Optimized Image to S3
          if (process.env.S3_SERVICE === 'true') {
            console.log('☁️  Uploading Optimized Image to S3...');
            const s3Key = `profiles/${Date.now()}-${currentFilename}.webp`;
            const optimizedS3Url = await s3Service.uploadFile(
              new File(
                [new Uint8Array(Buffer.from(optimized.base64, 'base64'))],
                s3Key,
                { type: optimized.mimeType },
              ),
              s3Key,
              optimized.mimeType,
            );
            console.log(`✅ S3 Upload Success: ${optimizedS3Url}`);
          }

          console.log('3️⃣  Testing BaseCard NFT Generation (PNG)...');
          const profileData = {
            nickname: 'TestUser',
            role: 'Tester',
            bio: 'Testing services',
            basename: 'test.base',
            // profileImage will be injected by generateNftPng using the buffer
            skills: ['Test', 'Debug'],
          };

          const nftPngBuffer = await imageService.generateNftPng(
            profileData,
            fileBuffer, // Pass original buffer
          );

          console.log(
            `✅ NFT PNG Generation Success. Size: ${(nftPngBuffer.length / (1024 * 1024)).toFixed(2)} MB`,
          );

          // Save NFT PNG locally
          const outputPngPath = path.join(
            resultsDir,
            `nft-${currentFilename}.png`,
          );
          fs.writeFileSync(outputPngPath, nftPngBuffer);
          console.log(`💾 Saved NFT PNG to: ${outputPngPath}`);

          // Upload NFT PNG to IPFS
          if (process.env.IPFS_SERVICE === 'true') {
            console.log('Qm  Uploading NFT PNG to IPFS...');
            const ipfsResult = await ipfsService.uploadFile(
              new File(
                [new Uint8Array(nftPngBuffer)],
                `nft-${currentFilename}.png`,
                {
                  type: 'image/png',
                },
              ),
            );

            if (ipfsResult.success) {
              console.log(`✅ IPFS Upload Success: ${ipfsResult.cid}`);
              console.log(
                `🔗 IPFS URL: https://gateway.pinata.cloud/ipfs/${ipfsResult.cid}`,
              );
            } else {
              console.error(`❌ IPFS Upload Failed: ${ipfsResult.error}`);
            }
          }
        }
      }
    } else {
      console.warn(`⚠️  Samples directory not found: ${samplesDir}`);
    }

    if (process.env.S3_SERVICE === 'true' && !fs.existsSync(samplesDir)) {
      // Fallback test if no samples
      console.log('1️⃣  Testing S3 Upload (Dummy Image)...');
      s3Url = await s3Service.uploadFile(
        new File([new Uint8Array(imageBuffer)], filename, { type: mimetype }),
        `test/${Date.now()}-${filename}`,
        mimetype,
      );
      console.log('✅ S3 Upload Success:', s3Url);
    }
  } catch (error) {
    console.error('❌ Test Failed:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
