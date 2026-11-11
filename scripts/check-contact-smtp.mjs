// Manual, operator-only preflight. Does not send email or enable the website.
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { smtpConfiguration } from '../server/email-delivery.js';
const config = smtpConfiguration({ ...process.env, CONTACT_DELIVERY_ENABLED: 'true' });
if (!config) {
  console.error('Incomplete SMTP configuration, invalid addresses, or a blocked preview environment. No message sent.');
  process.exitCode = 1;
} else {
  const transport = nodemailer.createTransport(config.transport);
  try {
    await transport.verify();
    console.log('SMTP connection, TLS and authentication verified. No message sent. Sender authorization and inbox delivery are NOT verified.');
  } catch {
    console.error('SMTP preflight failed. Inspect provider settings securely; no credentials or raw errors are printed. No message sent.');
    process.exitCode = 1;
  } finally {
    transport.close();
  }
}
