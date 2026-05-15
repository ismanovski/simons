async function getAccessToken(baseUrl, clientId, clientSecret) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || 'PayPal token request failed');
  }
  return data.access_token;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const env = String(process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
  const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  const clientIdPreview = clientId
    ? `${clientId.slice(0, 6)}...${clientId.slice(-4)}`
    : '';

  if (!clientId || !clientSecret) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        env,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        clientIdPreview,
        clientSecretLength: clientSecret.length,
        authOk: false,
        error: 'Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET'
      })
    };
  }

  try {
    await getAccessToken(baseUrl, clientId, clientSecret);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        env,
        hasClientId: true,
        hasClientSecret: true,
        clientIdPreview,
        clientSecretLength: clientSecret.length,
        authOk: true
      })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        env,
        hasClientId: true,
        hasClientSecret: true,
        clientIdPreview,
        clientSecretLength: clientSecret.length,
        authOk: false,
        error: String(error?.message || 'PayPal auth failed')
      })
    };
  }
};
