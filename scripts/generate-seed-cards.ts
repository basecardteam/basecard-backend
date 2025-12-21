/**
 * Generate BaseCard NFT images for Alice and Bob
 * Standalone script without NestJS context
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

dotenv.config();

// Same as ImageService but standalone
const assetsDir = path.join(__dirname, '../src/modules/basecards/assets');

async function loadAssets() {
  const templatePath = path.join(assetsDir, 'basecard-base.svg');
  const fontRegularPath = path.join(assetsDir, 'fonts/K2D-Regular.ttf');
  const fontBoldPath = path.join(assetsDir, 'fonts/K2D-Bold.ttf');

  const svgContent = fs.readFileSync(templatePath, 'utf-8');
  const base64Content = Buffer.from(svgContent).toString('base64');
  const baseCardBackgroundBase64 = `data:image/svg+xml;base64,${base64Content}`;

  const fontRegularBase64 = fs.existsSync(fontRegularPath)
    ? fs.readFileSync(fontRegularPath).toString('base64')
    : '';
  const fontBoldBase64 = fs.existsSync(fontBoldPath)
    ? fs.readFileSync(fontBoldPath).toString('base64')
    : '';

  return { baseCardBackgroundBase64, fontRegularBase64, fontBoldBase64 };
}

function generateCardSVG(
  profile: { nickname: string; role: string; bio?: string },
  profileImageDataUrl: string,
  assets: {
    baseCardBackgroundBase64: string;
    fontRegularBase64: string;
    fontBoldBase64: string;
  },
) {
  const { baseCardBackgroundBase64, fontRegularBase64, fontBoldBase64 } =
    assets;
  const width = 608;
  const height = 371;
  const textColor = '#000000';

  const truncateText = (text: string, maxLength: number) => {
    return text.length > maxLength
      ? text.substring(0, maxLength) + '...'
      : text;
  };

  const truncatedNickname = truncateText(profile.nickname, 20);
  const truncatedRole = truncateText(profile.role, 30);

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style>
      @font-face {
        font-family: 'K2D';
        src: url(data:font/ttf;charset=utf-8;base64,${fontRegularBase64}) format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'K2D';
        src: url(data:font/ttf;charset=utf-8;base64,${fontBoldBase64}) format('truetype');
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
       <path d="M 0 60 L 205 60 A 20 20 0 0 1 225 80 L 225 265 A 20 20 0 0 1 205 285 L 0 285 Z" />
    </clipPath>
  </defs>
  
  <!-- Card Background with BaseCard SVG -->
  <image href="${baseCardBackgroundBase64}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
  
  <!-- Profile Image -->
  <image href="${profileImageDataUrl}" xlink:href="${profileImageDataUrl}" x="0" y="60" width="225" height="225" clip-path="url(#profileClipPath)" preserveAspectRatio="xMidYMid slice"/>
  
  <!-- Profile Information -->
  <text x="258" y="100" class="card-text card-title">${truncatedNickname}</text>
  <text x="258" y="180" class="card-text card-role">${truncatedRole}</text>
</svg>`.trim();
}

async function prepareProfileImage(imageBuffer: Buffer): Promise<string> {
  const embeddedImageBuffer = await sharp(imageBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toBuffer();

  const base64 = embeddedImageBuffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

async function generateNftPng(
  profile: { nickname: string; role: string; bio?: string },
  profileImageDataUrl: string,
  assets: {
    baseCardBackgroundBase64: string;
    fontRegularBase64: string;
    fontBoldBase64: string;
  },
): Promise<Buffer> {
  const svg = generateCardSVG(profile, profileImageDataUrl, assets);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  console.log('🎨 Generating BaseCard NFT Images...\n');

  // Load assets
  const assets = await loadAssets();
  console.log('✅ Assets loaded\n');

  // Create output directory
  const outputDir = path.join(__dirname, '../test/results/seed-cards');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Test profiles (same as seed-test-data.ts)
  const profiles = [
    {
      name: 'alice',
      nickname: 'Alice',
      role: 'Developer',
      bio: 'Hello BaseCard! I am Alice, a blockchain developer.',
      sampleImage: 'profile1.png',
    },
    {
      name: 'bob',
      nickname: 'Bob',
      role: 'Designer',
      bio: 'Hello BaseCard! I am Bob, a UI/UX designer.',
      sampleImage: 'profile2.png',
    },
  ];

  const samplesDir = path.join(__dirname, '../test/samples');

  for (const profile of profiles) {
    console.log(`📦 Processing: ${profile.nickname}`);
    console.log(`   - Nickname: ${profile.nickname}`);
    console.log(`   - Role: ${profile.role}`);

    const imagePath = path.join(samplesDir, profile.sampleImage);

    try {
      let profileImageDataUrl: string;

      if (fs.existsSync(imagePath)) {
        const imageBuffer = fs.readFileSync(imagePath);
        profileImageDataUrl = await prepareProfileImage(imageBuffer);
        console.log(`   - Image: ${profile.sampleImage}`);
      } else {
        console.warn(`   ⚠️  Sample image not found: ${profile.sampleImage}`);
        // Default placeholder
        profileImageDataUrl =
          'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNDAiIHI9IjE1IiBmaWxsPSIjOUI5QkEwIi8+CjxwYXRoIGQ9Ik0yMCA4MEMyMCA2NS42NDA2IDMxLjY0MDYgNTQgNDYgNTRINTRDNjguMzU5NCA1NCA4MCA2NS42NDA2IDgwIDgwVjEwMEgyMFY4MFoiIGZpbGw9IiM5QjlCQTAiLz4KPC9zdmc+';
      }

      // Generate NFT PNG
      const nftBuffer = await generateNftPng(
        profile,
        profileImageDataUrl,
        assets,
      );

      // Save to file
      const outputPath = path.join(outputDir, `BaseCard_${profile.name}.png`);
      fs.writeFileSync(outputPath, nftBuffer);
      console.log(`   ✅ Saved: ${outputPath}`);
      console.log(`   📊 Size: ${(nftBuffer.length / 1024).toFixed(2)} KB\n`);
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`);
    }
  }

  console.log('='.repeat(50));
  console.log('🎉 Generation Complete!');
  console.log(`📁 Output directory: ${outputDir}`);
  console.log('\n📤 Next steps:');
  console.log('   1. Upload these PNG files to IPFS');
  console.log('   2. Copy the CIDs and update seed-test-data.ts');
  console.log('   3. Re-run seed: npx ts-node scripts/seed-test-data.ts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
