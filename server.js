// server.js
// Express relay for Quotit: inject Access Keys at the server layer
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ----- Config -----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Trust Render / proxies
app.set("trust proxy", true);

// Parse JSON + urlencoded
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static (serve your /public)
app.use(express.static(path.join(__dirname, "public"), { maxAge: "0" }));

// CORS (relax as needed)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Env Access Keys (do NOT log these)
const REMOTE_ACCESS_KEY = process.env.REMOTE_ACCESS_KEY || "";
const WEBSITE_ACCESS_KEY = process.env.WEBSITE_ACCESS_KEY || "";

// Helper: redact secrets if we ever log
const redact = (s = "") => (s ? s.replace(/[A-F0-9-]{8,}/gi, "****") : s);

// Helper: basic fetch with sane defaults
async function forward(url, options) {
  const resp = await fetch(url, {
    // keep default mode for Node
    ...options,
    headers: {
      Accept: "application/json,text/plain,text/html,*/*",
      ...(options?.headers || {}),
    },
  });
  // We return text always; client can parse if JSON
  const text = await resp.text();
  return { status: resp.status, text };
}

// ========== RELAY: Lead ==========
// Accepts JSON from the browser (Object.fromEntries(formData))
// We forward as x-www-form-urlencoded to Quotit
app.post("/relay/logquote", async (req, res) => {
  try {
    const leadObj = req.body && typeof req.body === "object" ? req.body : {};
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(leadObj)) {
      if (v != null) form.append(k, String(v));
    }
    const target =
      "https://www.quotit.net/quotit/apps/epro/logquote/logquote?";
    const { status, text } = await forward(target, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    res.status(status).send(text);
  } catch (err) {
    console.error("logquote relay error:", err);
    res.status(502).send(String(err?.message || err));
  }
});

// ========== RELAY: MembersDrugs ==========
// Two modes:
// 1) SaveMemberPrescriptions (form POST): ?_method=SaveMemberPrescriptions&_session=rw
//    expects websiteId, contactID, modelStr (JSON string) in the body
// 2) JSON SubmitMemberDrugs (no _method):
//    injects RemoteAccessKey + WebsiteAccessKey into JSON payload if missing
app.post("/relay/membersdrugs", async (req, res) => {
  try {
    const isSave =
      /_method=SaveMemberPrescriptions/i.test(req.url) ||
      /_method=SaveMemberPrescriptions/i.test(req.originalUrl || "");

    if (isSave) {
      // FORM MODE
      // Grab fields whether sent as JSON or form
      const websiteId =
        (req.body?.websiteId ??
          req.body?.websiteID ??
          req.body?.brokerID ??
          "") + "";
      const contactID = (req.body?.contactID ?? req.body?.ContactId ?? "") + "";
      const modelStr = (req.body?.modelStr ?? "") + "";

      if (!websiteId) {
        return res
          .status(400)
          .send("websiteId is required for SaveMemberPrescriptions");
      }
      if (!/^\d+$/.test(contactID)) {
        return res
          .status(400)
          .send("contactID must be numeric for SaveMemberPrescriptions");
      }
      if (!modelStr) {
        return res.status(400).send("modelStr is required");
      }

      const form = new URLSearchParams();
      form.set("websiteId", websiteId);
      form.set("contactID", contactID);
      form.set("modelStr", modelStr);

      const target =
        "https://www.quotit.net/quotit/apps/Common/ActWS/ACA/v2/SubmitMemberDrugs?_method=SaveMemberPrescriptions&_session=rw";
      const { status, text } = await forward(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: form.toString(),
      });

      // If their backend returns auth error, just pass it through.
      // The browser can decide to re-try JSON path if desired.
      return res.status(status).send(text);
    } else {
      // JSON MODE
      // Client may send a full payload; we inject keys if missing.
      const payload =
        req.body && typeof req.body === "object" ? { ...req.body } : {};

      if (!payload.RemoteAccessKey) payload.RemoteAccessKey = REMOTE_ACCESS_KEY;
      if (!payload.WebsiteAccessKey)
        payload.WebsiteAccessKey = WEBSITE_ACCESS_KEY;

      // Optional: quick sanity checks
      if (!payload.ContactId && !payload.FamilyId) {
        return res
          .status(400)
          .json({ error: "ContactId or FamilyId is required" });
      }
      if (!payload.RemoteAccessKey || !payload.WebsiteAccessKey) {
        return res.status(400).json({
          error:
            "Server is missing REMOTE_ACCESS_KEY and/or WEBSITE_ACCESS_KEY env vars",
        });
      }

      const target =
        "https://www.quotit.net/quotit/apps/Common/ActWS/ACA/v2/SubmitMemberDrugs";
      const { status, text } = await forward(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.status(status).send(text);
    }
  } catch (err) {
    console.error("membersdrugs relay error:", err);
    res.status(502).send(String(err?.message || err));
  }
});

// Health check
app.get("/healthz", (req, res) => res.type("text").send("ok"));

// Render uses PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(
    `Relay up on :${PORT} • Keys loaded: RA=${redact(
      REMOTE_ACCESS_KEY
    )}, WA=${redact(WEBSITE_ACCESS_KEY)}`
  )
);
