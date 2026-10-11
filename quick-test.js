const fetch = require('node-fetch');

const API_URL = 'http://localhost:3001/api';

(async () => {
  // Login
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@tradeing.local', password: 'Admin@12345' })
  });
  const { accessToken } = await loginRes.json();
  console.log('✓ Logged in');
  
  // Test quote
  const quoteRes = await fetch(`${API_URL}/market/twelvedata/quote/EURUSD?mode=LIVE`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const quoteData = await quoteRes.json();
  console.log('✓ EUR/USD Quote:', quoteData);
  
  // Test candles
  const candlesRes = await fetch(`${API_URL}/market/twelvedata/candles?symbol=EUR/USD&interval=1h&outputsize=5&mode=LIVE`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const candlesData = await candlesRes.json();
  console.log('✓ EUR/USD Candles:', candlesData);
})();
