import { privateKeyToAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';
import axios from 'axios';

async function main() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const address = account.address;
  const message = 'Sign in to BaseCard';

  console.log(`Testing with address: ${address}`);

  // 1. Sign Message
  const signature = await account.signMessage({ message });

  const baseUrl = 'http://localhost:3000'; // Adjust port if needed

  try {
    // 2. Login
    console.log('Attempting login...');
    const loginRes = await axios.post(`${baseUrl}/auth/login/wallet`, {
      address,
      message,
      signature,
    });

    if (loginRes.status === 200 && loginRes.data.access_token) {
      console.log('Login Successful! Token received.');
      const token = loginRes.data.access_token;

      // 3. Access Protected Route
      console.log('Accessing protected route with token...');
      try {
        const userRes = await axios.get(`${baseUrl}/users/address/${address}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Protected Route Access: SUCCESS', userRes.data);
      } catch (e) {
        console.error('Protected Route Access: FAILED', e.message);
      }

      // 4. Access Protected Route WITHOUT Token
      console.log('Accessing protected route WITHOUT token...');
      try {
        await axios.get(`${baseUrl}/users/address/${address}`);
        console.error(
          'Unauthenticated Access: FAILED (Should have been rejected)',
        );
      } catch (e) {
        if (e.response && e.response.status === 401) {
          console.log('Unauthenticated Access: SUCCESS (Rejected as expected)');
        } else {
          console.error(
            'Unauthenticated Access: FAILED with unexpected error',
            e.message,
          );
        }
      }
    } else {
      console.error('Login Failed', loginRes.data);
    }
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error('Connection Refused. Is the server running?');
    } else {
      console.error('Test Failed:', e.message, e.response?.data);
    }
  }
}

main();
