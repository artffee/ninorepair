/**
 * Vercel serverless entry point.
 *
 * An Express app is already a (req, res) handler, so it can be exported
 * directly. vercel.json rewrites every /api/* path here; the original path is
 * preserved, so the app's own routes still match.
 *
 * Static files are NOT served through this function — vercel.json points the
 * platform at public/ so the CDN handles them without an invocation.
 */

export { default } from '../server/app.js';
