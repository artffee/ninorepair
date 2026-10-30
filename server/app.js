import 'dotenv/config';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiError, GoogleGenAI } from '@google/genai';
import express from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
// zod/v4 (shipped inside zod 3.25) for z.toJSONSchema — the estimator's schema
// is declared once and used both to constrain Gemini and to validate its reply.
import { z } from 'zod/v4';

import {
  BUSINESS,
  CHAT_SYSTEM_PROMPT,
  ESTIMATE_SYSTEM_PROMPT,
} from './knowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');


/* Google AI Studio free tier. Both jobs run on 2.5 Flash: it is multimodal, it
 * is on the free tier, and the estimator needs vision. Flash Lite is cheaper
 * and faster if the chat widget ever gets busy. */
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const CHAT_MODEL = process.env.NINO_CHAT_MODEL || 'gemini-2.5-flash';
const VISION_MODEL = process.env.NINO_VISION_MODEL || 'gemini-2.5-flash';

if (!API_KEY) {
  console.warn(
    '\n  ⚠  GEMINI_API_KEY is not set. The site will serve, but /api/chat and\n' +
      '     /api/estimate will return 503. Get a free key at\n' +
      '     https://aistudio.google.com/apikey, then copy .env.example to .env.\n',
  );
}

// Constructed only when a key exists — the SDK does not read the environment
// itself, and the site must still serve the marketing pages without one.
const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;
const app = express();

app.disable('x-powered-by');
// Behind Vercel's proxy every request arrives from the same socket, so without
// this req.ip is identical for all callers and the per-IP rate limit below
// collapses into one global bucket.
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));

/* ── Implicit caching ──────────────────────────────────────────────────────────
 * Gemini 2.5 caches repeated prompt prefixes automatically — no cache_control
 * to set, but it only hits when the prefix is byte-identical. The system prompt
 * carries the whole price book and scope of work (~4k tokens) and never varies;
 * everything volatile (the question, the photos) goes in `contents`, after it.
 * Watch cached= in the console: if it stays at 0 across requests, something
 * upstream started interpolating into the prompt.
 * ──────────────────────────────────────────────────────────────────────────── */
function logUsage(label, usage) {
  if (!usage) return;
  console.log(
    `[${label}] in=${usage.promptTokenCount ?? 0} out=${usage.candidatesTokenCount ?? 0} ` +
      `think=${usage.thoughtsTokenCount ?? 0} cached=${usage.cachedContentTokenCount ?? 0}`,
  );
}

/** Gemini history uses 'model' where the API we expose to the browser says 'assistant'. */
const toContents = (messages) =>
  messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

/* ── Rate limiting ─────────────────────────────────────────────────────────────
 * Small in-memory bucket. Enough to stop a bored visitor from burning the API
 * key. Behind a load balancer or multiple instances, swap for Redis.
 * ──────────────────────────────────────────────────────────────────────────── */
const buckets = new Map();

function rateLimit({ key, max, windowMs }) {
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const hits = (buckets.get(id) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.status(429).json({
        error: `Too many requests. Take a breather, or just text Nino at ${BUSINESS.phone}.`,
      });
      return;
    }
    hits.push(now);
    buckets.set(id, hits);
    next();
  };
}

// Keep the bucket map from growing forever on a long-lived process.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, hits] of buckets) {
    const live = hits.filter((t) => t > cutoff);
    if (live.length) buckets.set(id, live);
    else buckets.delete(id);
  }
}, 10 * 60 * 1000).unref();

function requireApiKey(_req, res, next) {
  if (!ai) {
    res.status(503).json({
      error: `The assistant is offline right now. Call or text Nino at ${BUSINESS.phone}.`,
    });
    return;
  }
  next();
}

/**
 * thinkingConfig is only accepted by the 2.5 family, and 2.5 Pro refuses a
 * budget of 0. If whatever model is configured rejects it, retry once without
 * rather than failing the customer's request over a tuning parameter.
 */
async function withThinkingFallback(call, params) {
  try {
    return await call(params);
  } catch (err) {
    const { thinkingConfig, ...config } = params.config || {};
    if (thinkingConfig && err instanceof ApiError && err.status === 400) {
      console.warn('[gemini] retrying without thinkingConfig —', err.message);
      return call({ ...params, config });
    }
    throw err;
  }
}

/** Busy vs broken, in the customer's words. Free tier hits 429 first. */
function friendlyError(err, busy, broken) {
  const status = err instanceof ApiError ? err.status : 0;
  return status === 429 || status === 503 ? busy : broken;
}

/* ── /api/chat — streaming assistant ─────────────────────────────────────────── */

const ChatBody = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

app.post(
  '/api/chat',
  requireApiKey,
  rateLimit({ key: 'chat', max: 40, windowMs: 10 * 60 * 1000 }),
  async (req, res) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid chat payload.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event, data) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      const stream = await withThinkingFallback(
        (p) => ai.models.generateContentStream(p),
        {
          model: CHAT_MODEL,
          contents: toContents(parsed.data.messages),
          config: {
            systemInstruction: CHAT_SYSTEM_PROMPT,
            maxOutputTokens: 1600,
            temperature: 0.6,
            // A front desk answers immediately. Nothing here needs deliberation,
            // and thinking tokens would sit between the question and the reply.
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      );

      let usage = null;
      let sent = 0;

      for await (const chunk of stream) {
        if (chunk.usageMetadata) usage = chunk.usageMetadata;
        const text = chunk.text;
        if (!text) continue;
        send('delta', { text });
        sent += text.length;
      }

      logUsage('chat', usage);

      // A blocked or empty candidate still ends the stream cleanly, so the
      // browser would sit on an empty bubble unless we say something.
      if (!sent) {
        send('error', {
          message: `That one came back empty. Text Nino at ${BUSINESS.phone} and he'll answer himself.`,
        });
      } else {
        send('done', { ok: true });
      }
    } catch (err) {
      console.error('[chat]', err);
      send('error', {
        message: friendlyError(
          err,
          `We're getting a lot of questions at once. Text Nino directly at ${BUSINESS.phone}.`,
          `Something went wrong on our end. Call or text Nino at ${BUSINESS.phone}.`,
        ),
      });
    } finally {
      res.end();
    }
  },
);

/* ── /api/estimate — photo-based ballpark quote ──────────────────────────────── */

const EstimateSchema = z.object({
  jobTitle: z.string().describe('Short name for the job, e.g. "Drywall patch + texture match"'),
  bucket: z
    .enum(['handyman', 'licensed', 'inspect'])
    .describe('handyman = Nino does it; licensed = needs a FL-licensed trade; inspect = needs inspection before pricing'),
  observations: z
    .array(z.string())
    .describe('What is literally visible in the photos: defect, material, rough size, surrounding finishes'),
  scope: z.array(z.string()).describe('The steps of the actual repair, in order'),
  lineItems: z
    .array(
      z.object({
        label: z.string(),
        low: z.number(),
        high: z.number(),
      }),
    )
    .describe('2-6 line items. Empty array when bucket is not "handyman".'),
  priceLow: z.number().describe('Total low end in USD. 0 when bucket is not "handyman".'),
  priceHigh: z.number().describe('Total high end in USD. 0 when bucket is not "handyman".'),
  estimatedHours: z.string().describe('Rough on-site time, e.g. "2-3 hours" or "half day"'),
  confidence: z.enum(['high', 'medium', 'low']),
  confidenceReason: z.string().describe('One sentence on what drives the confidence level'),
  watchOuts: z.array(z.string()).describe('Honest caveats: hidden conditions, paint flashing, tile matching, access'),
  photoTips: z.array(z.string()).describe('Specific additional photos that would tighten the estimate. Empty if photos suffice.'),
  summary: z.string().describe('2-4 sentences the customer reads first. Plain language, states this is a ballpark.'),
});

/**
 * Gemini's responseJsonSchema takes a subset of JSON Schema and errors on
 * keywords outside it, so strip what zod emits for its own benefit. The field
 * descriptions stay — they are what steer the model.
 */
function forGemini(node) {
  if (Array.isArray(node)) return node.map(forGemini);
  if (!node || typeof node !== 'object') return node;

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'additionalProperties') continue;
    out[key] = forGemini(value);
  }
  return out;
}

const ESTIMATE_JSON_SCHEMA = forGemini(z.toJSONSchema(EstimateSchema));

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/* 3 MB per file, not 8. Vercel caps a serverless request body at 4.5 MB total,
 * and five 8 MB photos would be rejected at the edge before Express ever saw
 * them. The browser downscales each photo to ~1600px before upload (see
 * js/main.js), which lands well under this — the ceiling is a backstop for
 * clients with JS disabled or an unusual file. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 5, fieldSize: 64 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, WEBP or GIF photos are supported.'));
      return;
    }
    cb(null, true);
  },
});

app.post(
  '/api/estimate',
  requireApiKey,
  rateLimit({ key: 'estimate', max: 12, windowMs: 60 * 60 * 1000 }),
  (req, res, next) => {
    upload.array('photos', 5)(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const photos = req.files || [];
    const description = String(req.body.description || '').slice(0, 2000).trim();
    const city = String(req.body.city || '').slice(0, 80).trim();
    const propertyType = String(req.body.propertyType || '').slice(0, 60).trim();
    const urgency = String(req.body.urgency || '').slice(0, 60).trim();

    if (!photos.length && !description) {
      res.status(400).json({ error: 'Add at least one photo or describe the job.' });
      return;
    }

    const details = [
      city && `City: ${city}`,
      propertyType && `Property type: ${propertyType}`,
      urgency && `Timing: ${urgency}`,
      description && `Customer describes it as: ${description}`,
      photos.length
        ? `${photos.length} photo${photos.length > 1 ? 's' : ''} attached.`
        : 'No photos attached — estimate from the description alone and lower the confidence accordingly.',
    ]
      .filter(Boolean)
      .join('\n');

    const parts = [
      ...photos.map((file) => ({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      })),
      { text: `Estimate this job for the Greater Fort Lauderdale market.\n\n${details}` },
    ];

    const unreadable = `We couldn't read that one. Text the photos straight to Nino at ${BUSINESS.phone}.`;

    try {
      const response = await withThinkingFallback(
        (p) => ai.models.generateContent(p),
        {
          model: VISION_MODEL,
          contents: [{ role: 'user', parts }],
          config: {
            systemInstruction: ESTIMATE_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseJsonSchema: ESTIMATE_JSON_SCHEMA,
            // Pricing judgement is the one place deliberation earns its keep.
            // The ceiling has to cover thinking tokens as well as the JSON, or
            // the reply gets truncated mid-object and fails to parse.
            thinkingConfig: { thinkingBudget: -1 },
            maxOutputTokens: 8000,
            temperature: 0.3,
          },
        },
      );

      logUsage('estimate', response.usageMetadata);

      const raw = response.text;
      if (!raw) {
        console.error('[estimate] empty candidate —', response.candidates?.[0]?.finishReason);
        res.status(502).json({ error: unreadable });
        return;
      }

      // Schema-constrained output is still model output. Validate before it
      // reaches the renderer, which trusts these fields.
      let parsedEstimate;
      try {
        parsedEstimate = EstimateSchema.safeParse(JSON.parse(raw));
      } catch {
        parsedEstimate = { success: false, error: 'not JSON' };
      }

      if (!parsedEstimate.success) {
        console.error('[estimate] failed validation —', String(parsedEstimate.error).slice(0, 400));
        res.status(502).json({ error: unreadable });
        return;
      }

      /* Short reference so the estimate on her screen, the email that lands in
       * Nino's inbox, and any follow-up she sends are all the same job. */
      const ref = `EST-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

      // Awaited, not fire-and-forget: a serverless function is frozen the moment
      // it responds, so anything started after res.json() would never send. A
      // failed email must not cost her the estimate, so it swallows its errors.
      const delivery = await emailEstimate({
        ref,
        estimate: parsedEstimate.data,
        description,
        city,
        propertyType,
        urgency,
        photos,
      });

      res.json({ estimate: parsedEstimate.data, ref, delivery });
    } catch (err) {
      console.error('[estimate]', err);
      res.status(502).json({
        error: friendlyError(
          err,
          `The estimator is busy — the free daily quota may be spent. Text your photos to ${BUSINESS.phone} and Nino will price it himself.`,
          `The estimator hit a snag. Text your photos to ${BUSINESS.phone} — same result, just faster.`,
        ),
      });
    }
  },
);

/* ── /api/lead — contact form ─────────────────────────────────────────────────── */

const LeadSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(40),
  email: z.string().max(160).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  service: z.string().max(120).optional().or(z.literal('')),
  message: z.string().max(3000).optional().or(z.literal('')),
  // Set when the lead comes from the estimator's follow-up form, so the email
  // subject can point at the estimate already sitting in the inbox.
  ref: z.string().max(24).optional().or(z.literal('')),
  // Honeypot: bots fill every field they find, humans never see this one.
  website: z.string().max(0).optional().or(z.literal('')),
});

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/* Where a lead can actually survive. On Vercel the filesystem is read-only and
 * /tmp dies with the invocation, so the JSONL file is not a sink there — email
 * is the only one. A lead is the whole point of the site, so if no sink exists
 * the form refuses honestly rather than returning ok and dropping it. */
const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const LEAD_SINKS = [
  !SERVERLESS && 'data/leads.jsonl',
  mailer && `email to ${process.env.LEAD_TO || BUSINESS.email}`,
].filter(Boolean);

const LEAD_TO = () => process.env.LEAD_TO || BUSINESS.email;
const FROM = () => `"NinoRepair Website" <${process.env.SMTP_USER}>`;
const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const block = (title, items) =>
  Array.isArray(items) && items.length
    ? `${title}\n${items.map((s) => `  - ${s}`).join('\n')}\n`
    : '';

/**
 * Every estimate is emailed to Nino with the photos attached, whether or not the
 * customer goes on to leave her name. Without this an estimate that does not
 * convert leaves no trace at all — he cannot follow up, and he cannot see what
 * people are actually asking about.
 *
 * Declared as a function so the estimate route above can call it despite being
 * defined earlier in the file; `mailer` is initialised by the time any request
 * arrives. Never throws.
 */
async function emailEstimate({ ref, estimate: e, description, city, propertyType, urgency, photos }) {
  if (!mailer) {
    console.log(`[estimate] ${ref} not emailed — SMTP is not configured`);
    return 'unavailable';
  }

  const priced = e.bucket === 'handyman' && Number(e.priceHigh) > 0;
  const range = priced ? `${usd(e.priceLow)}–${usd(e.priceHigh)}` : `not priced (${e.bucket})`;
  const context = [city && `City: ${city}`, propertyType && `Property: ${propertyType}`, urgency && `Timing: ${urgency}`]
    .filter(Boolean)
    .join(' · ');

  const body = [
    `Reference:  ${ref}`,
    `Job:        ${e.jobTitle}`,
    `Ballpark:   ${range}${priced ? `   on site: ${e.estimatedHours}` : ''}`,
    `Confidence: ${e.confidence} — ${e.confidenceReason}`,
    '',
    'SHE WROTE',
    description ? `  ${description}` : '  (no description)',
    context ? `  ${context}` : '',
    '',
    'SUMMARY SHE WAS SHOWN',
    `  ${e.summary}`,
    '',
    block('WHAT THE MODEL SAW', e.observations),
    block('SCOPE', e.scope),
    e.lineItems?.length
      ? `LINE ITEMS\n${e.lineItems.map((li) => `  - ${li.label}: ${usd(li.low)}–${usd(li.high)}`).join('\n')}\n`
      : '',
    block('WATCH-OUTS', e.watchOuts),
    block('PHOTOS THAT WOULD TIGHTEN IT', e.photoTips),
    photos.length ? `${photos.length} photo(s) attached.` : 'No photos — priced from the description alone.',
    '',
    'No contact details yet. If she asks for a follow-up on the result card, a',
    `separate "wants a call back" email arrives quoting ${ref}.`,
  ]
    .filter((line) => line !== '')
    .join('\n');

  try {
    const receipt = await mailer.sendMail({
      from: FROM(),
      to: LEAD_TO(),
      subject: `[${ref}] ${e.jobTitle} — ${range}${city ? ` (${city})` : ''}`,
      text: body,
      attachments: photos.map((file, i) => ({
        filename: file.originalname || `photo-${i + 1}.jpg`,
        content: file.buffer,
        contentType: file.mimetype,
      })),
    });
    if (!receipt.accepted?.length) return 'failed';
    console.log(`[estimate] ${ref} emailed to ${LEAD_TO()} with ${photos.length} photo(s)`);
    return 'accepted';
  } catch (err) {
    console.error(`[estimate] ${ref} email failed:`, err.message);
    return 'failed';
  }
}

app.post(
  '/api/lead',
  rateLimit({ key: 'lead', max: 10, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    const parsed = LeadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please add your name and a phone number.' });
      return;
    }
    if (parsed.data.website) {
      // Honeypot tripped — accept silently so the bot doesn't retry.
      res.json({ ok: true });
      return;
    }

    const lead = { ...parsed.data, receivedAt: new Date().toISOString(), ip: req.ip };
    delete lead.website;

    // Last resort, and the reason this line exists: if every sink below fails,
    // the lead is at least in the runtime log where it can be read back.
    console.log('[lead]', JSON.stringify(lead));

    let saved = false;

    if (!SERVERLESS) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.appendFileSync(path.join(DATA_DIR, 'leads.jsonl'), `${JSON.stringify(lead)}\n`);
        saved = true;
      } catch (err) {
        console.error('[lead] could not persist:', err);
      }
    }

    if (mailer) {
      try {
        await mailer.sendMail({
          from: FROM(),
          to: LEAD_TO(),
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
            '',
            lead.message || '(no message)',
            '',
            `Received ${lead.receivedAt}`,
          ].join('\n'),
        });
        saved = true;
      } catch (err) {
        console.error('[lead] email failed:', err);
      }
    }

    if (!saved) {
      // Never claim success for a lead that went nowhere.
      res.status(502).json({
        error: `Our form is not reaching us right now — please call or text Nino at ${BUSINESS.phone} and it is handled.`,
      });
      return;
    }

    res.json({ ok: true });
  },
);

/* ── Static site ──────────────────────────────────────────────────────────────── */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ai: Boolean(ai),
    contactDelivery: Boolean(mailer) || !SERVERLESS,
    provider: 'google',
    chatModel: CHAT_MODEL,
    visionModel: VISION_MODEL,
  });
});

/* Unknown API paths answer as API. Without this they fall through to the SPA
 * fallback below and try to sendFile a static file that is not in the
 * serverless bundle, turning a 404 into a 500. */
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unknown endpoint.' });
});

/* Local only in production — on Vercel the CDN serves public/ and these two
 * handlers are never reached. */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

app.use((_req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* This module only builds the app. `server/index.js` listens on a port for
 * local development; `api/index.js` hands the same app to Vercel as a
 * serverless function. Nothing here may assume a long-lived process. */
export default app;

export const summary = () => [
  `google · chat: ${CHAT_MODEL}   estimator: ${VISION_MODEL}${ai ? '' : '   (no key — AI offline)'}`,
  `leads → ${LEAD_SINKS.join(' + ') || 'NO DURABLE SINK — the form will refuse and tell customers to call'}`,
];
