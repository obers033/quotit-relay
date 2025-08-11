// server.js
import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static frontend files (index.html, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// ===== API CONFIG =====
const BASES = {
  stg: 'https://wwwstg.quotit.net/Quotit/Apps/Common/ActWS/ACA/v2',
  prod: 'https://www.quotit.net/Quotit/Apps/Common/ActWS/ACA/v2'
};

// Keys from Render environment variables
const RAK = process.env.REMOTE_ACCESS_KEY;
const WAK = process.env.WEBSITE_ACCESS_KEY;

if (!RAK || !WAK) {
  console.error('❌ Missing REMOTE_ACCESS_KEY or WEBSITE_ACCESS_KEY in environment variables.');
  process.exit(1);
}

// ===== API FORWARDER =====
async function forward(env, reqBody) {
  const base = BASES[env];
  if (!base) throw new Error('Invalid environment');

  const { method, body } = reqBody || {};
  if (!method || !body) throw new Error('Invalid payload');

  const withKeys = {
    ...body,
    RemoteAccessKey: RAK,
    WebsiteAccessKey: WAK
  };

  const url = `${base}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withKeys)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ActWS ${method} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ===== API ROUTES =====
app.post('/api/actws/stg', async (req, res) => {
  try {
    const data = await forward('stg', req.body);
    res.json(data);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post('/api/actws/prod', async (req, res) => {
  try {
    const data = await forward('prod', req.body);
    res.json(data);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ===== FALLBACK TO index.html =====
// This ensures SPA routing works even if the user refreshes on a subpath
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
