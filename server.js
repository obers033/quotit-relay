import express from "express";
import cors from "cors";

const app = express();

// CORS — lock this to your Render domain in production
app.use(cors({ origin: true, credentials: false }));

// Parse body for both lead form (x-www-form-urlencoded) and JSON (drugs)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health check
app.get("/relay/health", (req, res) => res.json({ ok: true }));

// Relay lead submission to Quotit
app.post("/relay/logquote", async (req, res) => {
  try {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.body)) {
      if (Array.isArray(v)) {
        v.forEach(val => params.append(k, String(val ?? "")));
      } else {
        params.append(k, String(v ?? ""));
      }
    }
    const upstream = await fetch("https://www.quotit.net/quotit/apps/epro/logquote/logquote?", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });
    const text = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get("content-type") || "text/plain").send(text);
  } catch (err) {
    console.error("Logquote relay error:", err);
    res.status(502).json({ error: "logquote relay failed", detail: String(err) });
  }
});

// Relay MembersDrugs submission to Quotit
app.post("/relay/membersdrugs", async (req, res) => {
  try {
    const upstream = await fetch("https://www.quotit.net/quotit/apps/Common/ActWS/ACA/v2/SubmitMemberDrugs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const text = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get("content-type") || "text/plain").send(text);
  } catch (err) {
    console.error("MembersDrugs relay error:", err);
    res.status(502).json({ error: "membersdrugs relay failed", detail: String(err) });
  }
});

// Serve static HTML form
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Relay listening on http://localhost:${PORT}`));
