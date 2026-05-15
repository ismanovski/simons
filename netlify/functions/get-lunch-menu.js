exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
    };
  }

  try {
    const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/lunch_menu_items?select=day_name,weekday,dish,unit_price,quantity_available,is_active&order=weekday.asc`;
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ ok: false, error: text || 'Supabase request failed' })
      };
    }

    let rows = [];
    try {
      rows = JSON.parse(text);
    } catch {
      rows = [];
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, rows })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: error?.message || 'Unexpected error' })
    };
  }
};
