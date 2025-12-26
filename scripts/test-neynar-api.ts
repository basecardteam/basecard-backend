import 'dotenv/config';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/user/bulk';

async function testNeynarApi() {
  if (!NEYNAR_API_KEY) {
    console.error('❌ NEYNAR_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('🔍 Testing Neynar API...\n');

  // Test FIDs - you can modify these
  const testFids = [402755]; // Your FID or any test FID

  try {
    const response = await fetch(
      `${NEYNAR_API_URL}?fids=${testFids.join(',')}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': NEYNAR_API_KEY,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ API Error (${response.status}):`, error);
      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ API Response:\n');
    console.log(JSON.stringify(data, null, 2));

    // Extract useful info
    if (data.users && data.users.length > 0) {
      console.log('\n📊 User Summary:');
      data.users.forEach((user: any) => {
        console.log(`  - FID: ${user.fid}`);
        console.log(`    Username: ${user.username}`);
        console.log(`    Display Name: ${user.display_name}`);
        console.log(`    PFP: ${user.pfp_url}`);
        console.log(`    Followers: ${user.follower_count}`);
        console.log(`    Following: ${user.following_count}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
    process.exit(1);
  }
}

testNeynarApi();
