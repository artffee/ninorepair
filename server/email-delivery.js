import { z } from 'zod/v4';

const mailbox = z.string().max(254).email();

// Credentials alone never enable delivery. Preview deployments cannot send,
// even if production credentials were accidentally shared with them.
export function smtpConfiguration(env) {
  if (env.CONTACT_DELIVERY_ENABLED !== 'true') return null;
  if (env.VERCEL && env.VERCEL_ENV !== 'production') return null;
  const port = Number(env.SMTP_PORT || 587);
  if (![465, 587, 2465, 2587].includes(port) ||
      !/^[a-z0-9.-]+$/i.test(env.SMTP_HOST || '') ||
      !env.SMTP_USER || !env.SMTP_PASS ||
      !mailbox.safeParse(env.SMTP_FROM).success ||
      !mailbox.safeParse(env.LEAD_TO).success) return null;
  return {
    from: { name: 'NinoRepair Website', address: env.SMTP_FROM },
    to: env.LEAD_TO,
    transport: {
      host: env.SMTP_HOST,
      port,
      secure: port === 465 || port === 2465,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      dnsTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    },
  };
}

// SMTP acceptance is not inbox delivery. Require the exact, single business
// recipient and a final positive SMTP reply. Do not retry ambiguous outcomes.
export async function sendOwnerEmail(mailer, message, timeoutMs = 15000) {
  if (!mailbox.safeParse(message.to).success) throw new Error('Invalid owner recipient.');
  let timer;
  try {
    const receipt = await Promise.race([
      mailer.sendMail(message),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Mail acceptance timed out.')), timeoutMs);
      }),
    ]);
    const accepted = receipt?.accepted;
    const address = accepted?.[0];
    const acceptedAddress = typeof address === 'string' ? address : address?.address;
    if (!Array.isArray(accepted) || accepted.length !== 1 ||
        typeof acceptedAddress !== 'string' || acceptedAddress.toLowerCase() !== message.to.toLowerCase() ||
        !Array.isArray(receipt.rejected) || receipt.rejected.length !== 0 ||
        !/^250(?:[ -]|$)/.test(receipt.response || '')) {
      throw new Error('Mail service did not accept the owner recipient.');
    }
    return receipt;
  } finally {
    clearTimeout(timer);
  }
}
