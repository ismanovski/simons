/*
// Supabase Edge Function: send-confirmation
// Sendet Bestellbestätigungen via Brevo (ehem. Sendinblue)
// Kostenlos: 300 E-Mails/Tag ≈ 9.000/Monat
//
// Einrichtung:
// 1. Kostenloses Konto auf https://www.brevo.com anlegen
// 2. Settings → SMTP & API → API Keys → "Create a new API key" → kopieren
// 3. In Supabase Dashboard → Project Settings → Edge Functions → Secrets:
//    BREVO_API_KEY = dein-api-key
//    FROM_EMAIL    = deine-absender@email.de  (muss in Brevo verifiziert sein)
// 4. Edge Function deployen:
//    npx supabase functions deploy send-confirmation

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
    const FROM_EMAIL    = Deno.env.get('FROM_EMAIL') ?? 'noreply@simonsbrotkoerbchen.de';
    const FROM_NAME     = 'Simonsbrotkörbchen';

    if (!BREVO_API_KEY) {
      return new Response(JSON.stringify({ error: 'BREVO_API_KEY nicht konfiguriert' }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const p = await req.json() as Record<string, string>;

    const isLunch     = String(p.order_type || '').toLowerCase().includes('mittagstisch');
    const subject     = `✅ Bestellbestätigung – ${p.order_type} #${p.order_number}`;
    const htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; background: #faf8f5; margin: 0; padding: 0; color: #2d1f0e; }
    .wrap { max-width: 560px; margin: 2rem auto; background: #fff; border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: #2d1f0e; color: #fff; padding: 1.5rem 2rem; }
    .header h1 { margin: 0; font-size: 1.3rem; }
    .header p  { margin: 0.3rem 0 0; opacity: 0.75; font-size: 0.9rem; }
    .body { padding: 1.75rem 2rem; }
    .greeting { font-size: 1.05rem; margin-bottom: 1.2rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    td { padding: 0.55rem 0; border-bottom: 1px solid #f0ebe3; font-size: 0.93rem; }
    td:first-child { color: #7a6a5a; width: 42%; }
    td:last-child { font-weight: 600; }
    .code-box { background: #fdf5e8; border: 2px dashed #c8a96e; border-radius: 8px;
                text-align: center; padding: 1rem; margin: 1.25rem 0; }
    .code-box .label { font-size: 0.8rem; color: #7a6a5a; margin-bottom: 0.3rem; }
    .code-box .code  { font-size: 1.6rem; font-weight: 700; letter-spacing: 0.05em; color: #2d1f0e; }
    .footer { background: #faf8f5; text-align: center; padding: 1rem 2rem;
              font-size: 0.8rem; color: #9e8e7e; border-top: 1px solid #f0ebe3; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Simonsbrotkörbchen</h1>
      <p>Lenaustraße 1 · 40472 Düsseldorf</p>
    </div>
    <div class="body">
      <p class="greeting">Hallo ${p.to_name},<br>vielen Dank für deine ${isLunch ? 'Reservierung' : 'Bestellung'}! 🥐</p>
      <table>
        <tr><td>Bestellart</td><td>${p.order_type}</td></tr>
        <tr><td>Bestellnummer</td><td>${p.order_number}</td></tr>
        <tr><td>${isLunch ? 'Gericht' : 'Bestellte Artikel'}</td><td>${p.items_text}</td></tr>
        <tr><td>${isLunch ? 'Abhol-/Liefertermin' : 'Wunschtermin'}</td><td>${p.date_time}</td></tr>
        <tr><td>Art der Übergabe</td><td>${p.fulfillment_type}</td></tr>
        <tr><td>Adresse / Ort</td><td>${p.location}</td></tr>
        <tr><td>Gesamtbetrag</td><td>${p.total_price}</td></tr>
        <tr><td>Zahlungsart</td><td>${p.payment_method}</td></tr>
      </table>
      <div class="code-box">
        <div class="label">Dein Abholcode</div>
        <div class="code">${p.pickup_code}</div>
      </div>
      <p style="font-size:0.88rem;color:#7a6a5a;">
        Bitte zeige diesen Code bei der Abholung vor. Bei Fragen erreichst du uns unter
        <a href="tel:+4921160166103" style="color:#c8a96e;">0211-60166103</a>.
      </p>
    </div>
    <div class="footer">
      © Simonsbrotkörbchen · Diese E-Mail wurde automatisch erzeugt.
    </div>
  </div>
</body>
</html>`;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: [{ email: p.to_email, name: p.to_name }],
        subject,
        htmlContent,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      console.error('Brevo Fehler:', errText);
      return new Response(JSON.stringify({ error: errText }), {
        status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Edge Function Fehler:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
});
*/
