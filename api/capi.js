const crypto = require('crypto');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    res.status(500).json({ error: 'Missing Meta env vars' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const eventName = body.event_name;
  if (!eventName) {
    res.status(400).json({ error: 'event_name required' });
    return;
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: body.event_id || crypto.randomUUID(),
    event_source_url: body.event_source_url || null,
    action_source: 'website',
    user_data: {
      client_ip_address: getClientIp(req),
      client_user_agent: req.headers['user-agent'] || null,
    },
  };

  if (body.fbp) event.user_data.fbp = body.fbp;
  if (body.fbc) event.user_data.fbc = body.fbc;

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
      }
    );
    const data = await response.json();
    res.status(response.ok ? 200 : 502).json(data);
  } catch (err) {
    res.status(502).json({ error: 'CAPI request failed' });
  }
};
