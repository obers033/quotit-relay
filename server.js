// server.js
// Minimal ActWS proxy with key injection (supports SearchRxDrugs)

import express from 'express';
import cors from 'cors';

// Node 18+ has global fetch; if <18, install node-fetch and import it.
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: true })); // allow your frontend origin

const BASES = {
  stg:  'https://wwwstg.quotit.net/Quotit/Apps/Common/ActWS/ACA/v2',
  prod: 'https://www.quotit.net/Quotit/Apps/Common/ActWS/ACA/v2'
};

// Whitelist only the methods you actually need
const ALLOWED = new Set([
  'GetFamily',
  'GetMemberDrugs',
  'SubmitMemberDrugs',
  'SearchRxDrugs',          // <-- important for type-ahead
  // add others you use here...
]);

// Helper to clean undefined keys (so we don't send explicit null when not needed)
const clean = (obj) => {
  Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
  return obj;
};

app.post('/api/actws/:env', async (req, res) => {
  try {
    const { env } = req.params;
    const { method, body } = req.body || {};

    if (!BASES[env]) {
      return res.status(400).json({ Errors: [`Invalid env "${env}"`], IsSuccess: false });
    }
    if (!method || !ALLOWED.has(method)) {
      return res.status(400).json({ Errors: [`Unsupported or missing method "${method}"`], IsSuccess: false });
    }

    const url = `${BASES[env]}/${method}`;

    // Inject keys if caller left them null/undefined (recommended)
    const payload = clean({
      ...(body || {}),
      RemoteAccessKey: (body?.RemoteAccessKey ?? process.env.QUOTIT_RAK),
      WebsiteAccessKey: (body?.WebsiteAccessKey ?? process.env.QUOTIT_WAK)
    });

    // Basic sanity: SearchRxDrugs needs Inputs.Keyword for realtime
    if (method === 'SearchRxDrugs' && !payload.Inputs?.Keyword) {
      return res.status(400).json({ Errors: ['Inputs.Keyword is required'], IsSuccess: false });
    }

    // Forward to Quotit
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      // Abort after 30s
      signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { /* leave as text */ }

    // Mirror upstream status; default to JSON if parse worked
    res.status(upstream.status);
    if (json !== undefined) {
      res.json(json);
    } else {
      res.type('text/plain').send(text);
    }
  } catch (err) {
    // Network/CORS/timeout or unexpected failure
    res.status(502).json({
      Errors: ['Proxy error', String(err?.message || err)],
      IsSuccess: false
    });
  }
});

// Health check
app.get('/healthz', (_, res) => res.type('text/plain').send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ActWS proxy listening on :${PORT}`));
