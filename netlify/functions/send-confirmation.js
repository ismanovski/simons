// Netlify Function: send-confirmation
// Sendet Bestellbestätigungen als Standardtext + Kundendaten.
//
// Erforderliche Netlify Environment Variables (SMTP, ohne Brevo-Zwang):
// - SMTP_HOST      (z. B. smtp.ionos.de / smtp.strato.de / smtp.gmail.com)
// - SMTP_PORT      (meist 465 oder 587)
// - SMTP_SECURE    ("true" für SSL/465, sonst "false")
// - SMTP_USER      (SMTP Benutzername)
// - SMTP_PASS      (SMTP Passwort)
// - MAIL_FROM      (Absenderadresse, z. B. info@deinedomain.de)
// - MAIL_FROM_NAME (optional, Standard: Simonsbrotkörbchen)

const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: 'ok' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const toName = String(payload.to_name || '').trim();
    const toEmail = String(payload.to_email || '').trim();

    if (!toEmail || !toName) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'to_name und to_email sind erforderlich' })
      };
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || '587');
    const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmail = process.env.MAIL_FROM;
    const fromName = process.env.MAIL_FROM_NAME || 'Simonsbrotkörbchen';

    if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'SMTP Konfiguration fehlt (SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM).' })
      };
    }

    const subject = `✅ Bestellbestätigung ${payload.order_number ? `#${payload.order_number}` : ''}`.trim();
    const itemsText = String(payload.items_text || '-');
    const dateTime = String(payload.date_time || '-');
    const fulfillmentType = String(payload.fulfillment_type || '-');
    const location = String(payload.location || '-');
    const totalPrice = String(payload.total_price || '-');
    const paymentMethod = String(payload.payment_method || '-');
    const orderType = String(payload.order_type || 'Bestellung');
    const orderNumber = String(payload.order_number || '-');
    const pickupCode = String(payload.pickup_code || '-');
    const modeLabel = /liefer/i.test(fulfillmentType) ? 'Lieferung' : 'Abholung';
    const isDelivery = modeLabel === 'Lieferung';
    const locationDisplay = modeLabel === 'Abholung'
      ? 'Lenaustraße 1, 40470 Düsseldorf (Simonsbrotkörbchen Filiale)'
      : location;
    const codeBoxHtml = isDelivery ? '' : `
        <div style="margin:18px 0;padding:14px;border:2px dashed #c8a96e;background:#fff9ee;text-align:center;border-radius:8px;">
          <div style="font-size:12px;color:#7d6b59;">Dein Abholcode</div>
          <div style="font-size:26px;font-weight:700;letter-spacing:0.06em;">${pickupCode}</div>
        </div>

        <p style="font-size:13px;color:#7d6b59;">Bitte zeige den Abholcode bei der Abholung vor.</p>
    `;

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#2d1f0e;line-height:1.5;">
        <h2 style="margin-bottom:8px;">Simonsbrotkörbchen – Bestellbestätigung</h2>
        <p style="margin-top:0;color:#6c5b4a;">Hallo ${toName}, danke für deine Bestellung.</p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Art</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${orderType}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Bestellnr.</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${orderNumber}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Artikel</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${itemsText}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">${modeLabel}</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${dateTime}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Ort/Adresse</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${locationDisplay}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Betrag</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${totalPrice}</td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6c5b4a;">Zahlungsart</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;">${paymentMethod}</td></tr>
        </table>

        ${codeBoxHtml}
      </div>
    `;

    const textContent = [
      `Hallo ${toName},`,
      '',
      'deine Bestellung wurde erfolgreich gespeichert.',
      `Art: ${orderType}`,
      `Bestellnr.: ${orderNumber}`,
      `Artikel: ${itemsText}`,
      `${modeLabel}: ${dateTime}`,
      `Ort/Adresse: ${locationDisplay}`,
      `Betrag: ${totalPrice}`,
      `Zahlungsart: ${paymentMethod}`,
      ...(isDelivery ? [] : [`Abholcode: ${pickupCode}`]),
      '',
      'Danke für deine Bestellung bei Simonsbrotkörbchen.'
    ].join('\n');

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: `${toName} <${toEmail}>`,
      subject,
      text: textContent,
      html: htmlContent
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (error) {
    console.error('send-confirmation error:', {
      message: error?.message,
      code: error?.code,
      response: error?.response,
      command: error?.command
    });
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: String(error?.message || error),
        code: error?.code || null,
        response: error?.response || null,
        command: error?.command || null
      })
    };
  }
};
