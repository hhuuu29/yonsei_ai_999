"use strict";

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET required' });
  }
  // An OAuth client ID is public configuration, never an API key or client secret.
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  return res.status(200).json({
    googleClientId: /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) ? clientId : ''
  });
};
