"use strict";

// Secrets remain in Vercel. Prompts and keys are never logged.
function createHandler(options = {}) {
  const buckets = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'POST required' });
    }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Origin not allowed' });
      } catch (_) { return res.status(403).json({ error: 'Origin not allowed' }); }
    }
    const apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI is not configured' });
    let body = req.body;
    if (typeof body === 'string') {
      if (Buffer.byteLength(body) > 200000) return res.status(413).json({ error: 'Input too large' });
      try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    if (!body || Buffer.byteLength(JSON.stringify(body)) > 200000) return res.status(413).json({ error: 'Input too large' });
    function validParts(parts) {
      return Array.isArray(parts) && parts.length > 0 && parts.length <= 5 &&
        parts.every(part => part && typeof part.text === 'string' && part.text.length > 0);
    }
    if (!Array.isArray(body.contents) || !body.contents.length || body.contents.length > 41 ||
        !body.contents.every(entry => entry && (!entry.role || ['user', 'model'].includes(entry.role)) && validParts(entry.parts)) ||
        (body.systemInstruction && !validParts(body.systemInstruction.parts))) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    // Burst protection is instance-local; configure project quotas in Vercel/Google.
    const now = Date.now();
    for (const [ip, bucket] of buckets) if (now - bucket.start >= 60000) buckets.delete(ip);
    const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || 'unknown').split(',')[0];
    const bucket = buckets.get(ip) || { start: now, count: 0 };
    if (bucket.count >= 10 || buckets.size >= 10000) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Please retry shortly' });
    }
    bucket.count++;
    buckets.set(ip, bucket);
    const payload = {
      contents: body.contents.map(entry => ({ role: entry.role || 'user', parts: entry.parts.map(part => ({ text: part.text })) })),
      generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' }, maxOutputTokens: 16384 }
    };
    if (body.systemInstruction) payload.systemInstruction = { parts: body.systemInstruction.parts.map(part => ({ text: part.text })) };
    try {
      const response = await (options.fetchImpl || fetch)(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(payload), signal: AbortSignal.timeout(55000) }
      );
      if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ error: 'AI request failed' });
      const data = await response.json();
      return res.status(200).json({ candidates: data.candidates || [] });
    } catch (_) { return res.status(502).json({ error: 'AI request failed' }); }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
