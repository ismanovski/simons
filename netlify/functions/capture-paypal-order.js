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

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  const env = String(process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
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
    const orderId = String(payload.orderId || '').trim();
    if (!orderId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Missing orderId' })
      };
    }

    let token;
    try {
      token = await getAccessToken(baseUrl, clientId, clientSecret);
    } catch (error) {
      const message = String(error?.message || 'PayPal token request failed');
      const isAuthError = /authentication|invalid_client|unauthorized|access denied/i.test(message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: false,
          error: isAuthError
            ? 'PayPal Auth fehlgeschlagen. Prüfe PAYPAL_ENV sowie PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET.'
            : message
        })
      };
    }
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json().catch(() => ({}));
    const success = response.ok && (data?.status === 'COMPLETED' || data?.status === 'APPROVED');
    if (!success) {
      return {
        statusCode: response.status || 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: data?.message || 'PayPal capture failed', data })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, status: data.status, id: data.id })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: error?.message || 'Unexpected error' })
    };
  }
};
