import { z } from 'zod/v4';
import { sendOwnerEmail } from './email-delivery.js';

const line = max => z.string().trim().max(max).refine(value => !/[\x00-\x1f\x7f]/.test(value));
export const LeadSchema = z.object({
  name: line(120).pipe(z.string().min(1)),
  phone: line(40).refine(value => /^[+\d().\s-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ''))),
  email: z.string().trim().max(160).email().optional().or(z.literal('')),
  city: line(80).optional(),
  service: line(120).optional(),
  source: z.enum(['', 'Google Search', 'Google Maps', 'ChatGPT', 'Gemini', 'Perplexity', 'Other AI assistant', 'Social media', 'Friend or repeat customer', 'Other']).optional(),
  message: z.string().trim().max(3000).refine(value => !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)).optional(),
  ref: z.string().max(24).regex(/^[a-zA-Z0-9-]*$/).optional(),
  website: z.literal('').optional(),
}).strict();

const origins = new Set(['https://ninorepair.com', 'https://www.ninorepair.com']);
export function leadHandler({ mailer, from, to, logger = console }) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!origins.has(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site') {
      return res.status(403).json({ error: 'Please use the form on ninorepair.com.' });
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'Use the website request form.' });
    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please check your name, phone, optional email and request details.' });
    }
    if (!mailer) {
      return res.status(503).json({ delivery: 'unavailable', error: 'Automatic delivery is unavailable. Please review and send a text, or call Nino.' });
    }
    const lead = parsed.data;
    try {
      await sendOwnerEmail(mailer, {
        from,
        to,
        replyTo: lead.email || undefined,
        subject: lead.ref
          ? `[${lead.ref}] Wants a call back — ${lead.name}${lead.city ? ` (${lead.city})` : ''}`
          : `New job request — ${lead.name}${lead.city ? ` (${lead.city})` : ''}`,
        text: [
          `Name:    ${lead.name}`,
          `Phone:   ${lead.phone}`,
          `Email:   ${lead.email || '—'}`,
          `City:    ${lead.city || '—'}`,
          `Service: ${lead.service || '—'}`,
          `Found via (self-reported): ${lead.source || 'Not specified'}`,
          '', lead.message || '(no message)',
        ].join('\n'),
      });
      logger.info('[lead] smtp_accepted');
      return res.status(202).json({ ok: true, delivery: 'accepted' });
    } catch {
      // SMTP errors can include addresses, message content or credentials.
      // Never log the raw error or payload; never use logs as a lead inbox.
      logger.warn('[lead] acceptance_unconfirmed');
      return res.status(502).json({ delivery: 'unconfirmed', error: 'We could not confirm email acceptance. Please review and send a text, or call Nino. A delayed email may still arrive.' });
    }
  };
}
