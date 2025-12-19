import { privateKeyToAccount } from 'viem/accounts';
import axios from 'axios';

// 1. Admin Account (Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
// Ensure this address is in ADMIN_WALLET_ADDRESSES in .env for the test to pass the admin check!
const adminPk =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// 2. User Account (Random)
// Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
const userPk =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const baseUrl = 'http://localhost:4000/v1';

async function login(privateKey: `0x${string}`, label: string) {
  const account = privateKeyToAccount(privateKey);
  const message = 'Sign in to BaseCard';
  const signature = await account.signMessage({ message });

  try {
    const res = await axios.post(`${baseUrl}/auth/login/wallet`, {
      address: account.address,
      message,
      signature,
    });
    // Handle both wrapped result and direct
    const token = res.data.result?.access_token || res.data.access_token;
    if (!token) throw new Error('No token found');
    console.log(`[${label}] Login Success. Address: ${account.address}`);
    return token;
  } catch (e) {
    console.error(`[${label}] Login Failed:`, e.message);
    process.exit(1);
  }
}

async function main() {
  console.log('--- Starting Admin Flow Test ---');

  // 1. Test Admin Access
  const adminToken = await login(adminPk, 'ADMIN');

  console.log('[ADMIN] Attempting to GET All Quests...');
  try {
    const res = await axios.get(`${baseUrl}/quests`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(
      '[ADMIN] GET All Quests Status:',
      res.status,
      '(Expected: 200)',
    );
    const questList = res.data.result || res.data;
    console.log(
      '[ADMIN] Fetched Quests Count:',
      Array.isArray(questList) ? questList.length : 'Unknown structure',
    );
  } catch (e) {
    console.error(
      '[ADMIN] GET All Quests FAILED:',
      e.response?.status,
      e.response?.data,
    );
  }

  // 2. Test User Access (Should Fail to GET Quests)
  const userToken = await login(userPk, 'USER');

  console.log('[USER] Attempting to GET Quests (Should Fail)...');
  try {
    await axios.get(`${baseUrl}/quests`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    console.error('[USER] GET Quests SUCCEEDED (UNEXPECTED!)');
  } catch (e) {
    if (e.response?.status === 403) {
      console.log('[USER] GET Quests Failed as Expected (403 Forbidden)');
    } else {
      console.error(
        '[USER] GET Quests Failed with Unexpected Status:',
        e.response?.status,
        e.response?.data,
      );
    }
  }
}

main();
