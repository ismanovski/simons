Netlify Function: send-confirmation

Benötigte Environment Variables in Netlify (SMTP):
- SMTP_HOST      -> SMTP Server, z. B. smtp.ionos.de
- SMTP_PORT      -> 465 oder 587
- SMTP_SECURE    -> true bei 465, sonst false
- SMTP_USER      -> SMTP Benutzername
- SMTP_PASS      -> SMTP Passwort
- MAIL_FROM      -> verifizierte Absenderadresse (z. B. info@deinedomain.de)
- MAIL_FROM_NAME -> optional, z. B. Simonsbrotkörbchen

Endpoint:
/.netlify/functions/send-confirmation


PayPal Integration (serverseitig)

Benötigte Environment Variables in Netlify:
- PAYPAL_CLIENT_ID
- PAYPAL_CLIENT_SECRET
- PAYPAL_ENV      -> sandbox oder live (optional, Standard: sandbox)
- PAYPAL_CURRENCY -> z. B. EUR (optional, Standard: EUR)

Endpoints:
- /.netlify/functions/get-paypal-config
- /.netlify/functions/create-paypal-order
- /.netlify/functions/capture-paypal-order
