const upstream = 'https://scanwonder.captainnemo007.chatgpt.site/api/pilots/nino';
const origins = new Set(['https://ninorepair.com', 'https://www.ninorepair.com']);

// Only the random visit reference goes to ScanWonder. Customer details and SMS contents stay out.
export function quotePilot(key, send = fetch) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (!key || key.length < 32) return res.status(503).json({ active: false });
    const headers = { Authorization: 'Bearer ' + key };
    const options = { headers, redirect: 'error', signal: AbortSignal.timeout(4000) };
    if (req.method === 'POST') {
      if (!origins.has(req.get('Origin')) || req.get('Sec-Fetch-Site') === 'cross-site' ||
          req.get('Sec-GPC') === '1' || req.get('DNT') === '1') return res.status(403).json({ active: false });
      const ref = req.body?.reference;
      if (typeof ref !== 'string' || !/^[0-9a-f]{16}$/.test(ref) || Object.keys(req.body).length !== 1) return res.status(400).json({ active: false });
      headers['Content-Type'] = 'application/json';
      Object.assign(options, { method: 'POST', body: JSON.stringify({ reference: ref }) });
    }
    try {
      const upstreamResponse = await send(upstream, options);
      if (!upstreamResponse.ok) return res.status(upstreamResponse.status === 410 ? 410 : 503).json({ active: false });
      const data = await upstreamResponse.json();
      if (data.active !== true || (req.method === 'POST' && !['A','B'].includes(data.arm))) return res.status(503).json({ active: false });
      return res.json(req.method === 'POST' ? { active: true, arm: data.arm } : { active: true });
    } catch { return res.status(503).json({ active: false }); }
  };
}
