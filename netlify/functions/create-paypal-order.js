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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const env = String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  const baseUrl = env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const amount = Number(payload.amount || 0);
    const currency = String(payload.currency || process.env.PAYPAL_CURRENCY || 'EUR').toUpperCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Invalid amount' })
      };
    }

    const token = await getAccessToken(baseUrl, clientId, clientSecret);
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
              landing_page: 'LOGIN',
              user_action: 'PAY_NOW'
            }
          }
        },
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount.toFixed(2)
            }
          }
        ]
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.id) {
      return {
        statusCode: response.status || 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: data?.message || 'PayPal order creation failed' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, id: data.id })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error?.message || 'Unexpected error' })
    };
  }
};
