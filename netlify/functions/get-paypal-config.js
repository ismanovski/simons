exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  const currency = String(process.env.PAYPAL_CURRENCY || 'EUR').trim().toUpperCase();

  if (!clientId) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing PAYPAL_CLIENT_ID' })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, clientId, currency })
  };
};
