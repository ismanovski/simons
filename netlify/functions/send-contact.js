const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { name, email, topic, message } = body;

  if (!name || !email || !message) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const mailOptions = {
    from: `"${process.env.MAIL_FROM_NAME || 'Simonsbrotkörbchen'}" <${process.env.MAIL_FROM}>`,
    to: 'info@simons-brotkoerbchen.de',
    replyTo: email,
    subject: `Kontaktanfrage: ${topic || 'Allgemein'} – von ${name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
        <div style="background:#5c3b1e;padding:24px 32px;">
          <h2 style="color:#fff;margin:0;font-size:20px;">Neue Kontaktanfrage</h2>
          <p style="color:#d4a96a;margin:4px 0 0;font-size:13px;">Simonsbrotkörbchen – Kontaktformular</p>
        </div>
        <div style="padding:24px 32px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#888;width:120px;">Name</td><td style="padding:8px 0;font-weight:600;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#888;">E-Mail</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#5c3b1e;">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#888;">Anliegen</td><td style="padding:8px 0;">${topic || '–'}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
          <p style="font-size:14px;color:#333;white-space:pre-line;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
        </div>
        <div style="background:#f9f5f0;padding:12px 32px;font-size:12px;color:#aaa;">
          Gesendet über das Kontaktformular auf simons-brotkoerbchen.de
        </div>
      </div>
    `,
    text: `Neue Kontaktanfrage\n\nName: ${name}\nE-Mail: ${email}\nAnliegen: ${topic || '–'}\n\nNachricht:\n${message}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('Contact mail error:', err.code, err.response, err.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
