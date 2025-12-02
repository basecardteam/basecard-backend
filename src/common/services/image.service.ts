import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

export interface BaseCardProfile {
  nickname: string;
  basename: string;
  role: string;
  profileImage?: string;
  skills?: string[];
  bio?: string;
}

export interface BaseCardOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

@Injectable()
export class ImageService implements OnModuleInit {
  private readonly logger = new Logger(ImageService.name);
  private baseCardBackgroundBase64: string;
  private fontRegularBase64: string;
  private fontBoldBase64: string;

  async onModuleInit() {
    const assetsDir = path.join(__dirname, '../assets');
    const templatePath = path.join(assetsDir, 'basecard-base.svg');
    const fontRegularPath = path.join(assetsDir, 'fonts/K2D-Regular.ttf');
    const fontBoldPath = path.join(assetsDir, 'fonts/K2D-Bold.ttf');

    try {
      // Load Template
      const svgContent = fs.readFileSync(templatePath, 'utf-8');
      const base64Content = Buffer.from(svgContent).toString('base64');
      this.baseCardBackgroundBase64 = `data:image/svg+xml;base64,${base64Content}`;

      // Load Fonts
      if (fs.existsSync(fontRegularPath)) {
        const fontRegular = fs.readFileSync(fontRegularPath);
        this.fontRegularBase64 = fontRegular.toString('base64');
      }
      if (fs.existsSync(fontBoldPath)) {
        const fontBold = fs.readFileSync(fontBoldPath);
        this.fontBoldBase64 = fontBold.toString('base64');
      }

      this.logger.log('BaseCard assets loaded and encoded successfully.');
    } catch (error) {
      this.logger.error(
        `Failed to load BaseCard assets from ${assetsDir}`,
        error,
      );
    }
  }

  generateCardSVG(
    profile: BaseCardProfile,
    options: BaseCardOptions = {},
  ): string {
    const {
      width = 608,
      height = 371,
      backgroundColor = '#ffffff',
      textColor = '#000000',
      accentColor = '#0066ff',
    } = options;

    // Default profile image if none provided
    const defaultProfileImage =
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE1IiBmaWxsPSIjOUI5QkEwIi8+CjxwYXRoIGQ9Ik0yMCA4MEMyMCA2NS42NDA2IDMxLjY0MDYgNTQgNDYgNTRINTRDNjguMzU5NCA1NCA4MCA2NS42NDA2IDgwIDgwVjEwMEgyMFY4MFoiIGZpbGw9IiM5QjlCQTAiLz4KPC9zdmc+';

    // Use pre-loaded Base64 background
    const baseCardBackground = this.baseCardBackgroundBase64 || '';

    const profileImage = profile.profileImage || defaultProfileImage;

    // Truncate text to fit within card bounds
    const truncateText = (text: string, maxLength: number) => {
      return text.length > maxLength
        ? text.substring(0, maxLength) + '...'
        : text;
    };

    const truncatedNickname = truncateText(profile.nickname, 20);
    const truncatedBasename = truncateText(profile.basename, 25);
    const truncatedRole = truncateText(profile.role, 30);

    return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style>
      @font-face {
        font-family: 'K2D';
        src: url(data:font/ttf;charset=utf-8;base64,${this.fontRegularBase64}) format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'K2D';
        src: url(data:font/ttf;charset=utf-8;base64,${this.fontBoldBase64}) format('truetype');
        font-weight: 700;
        font-style: normal;
      }
      .card-text { 
        font-family: 'K2D', sans-serif; 
        fill: ${textColor}; 
      }
      .card-title { 
        font-size: 36px; 
        font-weight: 700; 
        fill: white;
      }
      .card-subtitle { 
        font-size: 16px; 
        font-weight: 400; 
        fill: white;
      }
      .card-role { 
        font-size: 28px; 
        font-weight: 700; 
        fill: white;
      }
    </style>
    <clipPath id="profileClipPath">
       <!-- Rounded corners only on the right side (Top-Right, Bottom-Right) -->
       <!-- Rect: x=0, y=60, w=225, h=225. Radius=20 -->
       <!-- Path: Start Top-Left(0,60) -> Line to Top-Right-Start(205,60) -> Arc to Top-Right-End(225,80) -> Line to Bottom-Right-Start(225,265) -> Arc to Bottom-Right-End(205,285) -> Line to Bottom-Left(0,285) -> Close -->
       <path d="M 0 60 L 205 60 A 20 20 0 0 1 225 80 L 225 265 A 20 20 0 0 1 205 285 L 0 285 Z" />
    </clipPath>
  </defs>
  
  <!-- Card Background with BaseCard SVG -->
  <image href="${baseCardBackground}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  
  <!-- Profile Image -->
  <image href="${profileImage}" xlink:href="${profileImage}" x="0" y="60" width="225" height="225" clip-path="url(#profileClipPath)" preserveAspectRatio="xMidYMid slice"/>
  
  <!-- Profile Information -->
  <text x="258" y="100" class="card-text card-title">${truncatedNickname}</text>
  <text x="258" y="130" class="card-text card-subtitle">${truncatedBasename}</text>
  <text x="258" y="180" class="card-text card-role">${truncatedRole}</text>
  
  <!-- Footer -->
  <!-- Removed footer as per previous user snippet which didn't have it in the string replacement version, but keeping it if needed. 
       The user's latest snippet had a footer but the design seems to be different from the first one. 
       I will stick to the layout implied by the coordinates in the first working version (x=258 etc) which matches the user's "New elements to inject" block.
  -->
</svg>`.trim();
  }

  async optimizeImage(imageBuffer: Buffer): Promise<{
    base64: string;
    mimeType: string;
  }> {
    const TARGET_SIZE = 512;
    const finalMimeType = 'image/webp';

    // 1. Basic pipeline (resize/compress)
    const baseSharpInstance = sharp(imageBuffer)
      .resize({ width: TARGET_SIZE, height: TARGET_SIZE, fit: 'cover' })
      .webp({ quality: 80 });

    const optimizedBuffer = await baseSharpInstance.toBuffer();

    const originalSize = imageBuffer.length;
    const optimizedSize = optimizedBuffer.length;
    const reduction = ((originalSize - optimizedSize) / originalSize) * 100;

    const originalMB = (originalSize / (1024 * 1024)).toFixed(2);
    const optimizedMB = (optimizedSize / (1024 * 1024)).toFixed(2);

    this.logger.log(
      `Image optimized: ${originalMB}MB -> ${optimizedMB}MB (${reduction.toFixed(2)}% saved)`,
    );

    const base64 = optimizedBuffer.toString('base64');

    return {
      base64: base64,
      mimeType: finalMimeType,
    };
  }

  /**
   * Generates the final BaseCard NFT as a PNG image.
   * Pipeline:
   * 1. Resize original profile image (High Quality).
   * 2. Generate SVG with embedded profile image.
   * 3. Convert SVG to PNG.
   */
  async generateNftPng(
    profile: BaseCardProfile,
    imageBuffer: Buffer,
  ): Promise<Buffer> {
    // 1. Prepare image for embedding (Resize and convert to PNG for compatibility)
    // Using PNG instead of WebP for better compatibility with SVG renderers
    const embeddedImageBuffer = await sharp(imageBuffer)
      .resize(512, 512, { fit: 'cover' })
      .png()
      .toBuffer();

    const base64 = embeddedImageBuffer.toString('base64');
    const profileImageDataUrl = `data:image/png;base64,${base64}`;

    // 2. Generate SVG with embedded image
    const svg = this.generateCardSVG({
      ...profile,
      profileImage: profileImageDataUrl,
    });

    // 3. Convert to PNG
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
}
