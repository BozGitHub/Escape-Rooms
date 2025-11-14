// api/check.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Parse incoming JSON safely
    let payload = req.body;
    if (payload == null) payload = {};
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload || '{}'); } catch { payload = {}; }
    }

    let { level, answer } = payload;

    // Normalize the answer
    const norm = String(answer || "")
      .trim()
      .toLowerCase()
      .replace(/[ _-]/g, "");

    // Convert level to integer
    if (typeof level === "string" && level.trim() !== "") {
      const parsed = parseInt(level, 10);
      if (!Number.isNaN(parsed)) level = parsed;
    }

    // -------------------------------------------------------
    // Load ALL answers from Vercel environment variables ONLY
    // -------------------------------------------------------
    const ANSWERS = [];

    // Assuming your variables are A_L1, A_L2, … A_L20 if needed
    for (let i = 1; i <= 50; i++) {
      const key = `A_L${i}`;
      const raw = process.env[key];

      if (!raw) break; // stop when there is no more env var

      // Multiple answers allowed, comma-separated
      const list = raw
        .split(',')
        .map(a => a.trim().toLowerCase().replace(/[ _-]/g, ''))
        .filter(a => a.length > 0);

      ANSWERS.push(list);
    }

    // Validate level
    if (!Number.isInteger(level) || level < 0 || level >= ANSWERS.length) {
      return res.status(200).json({ ok: false, reason: "bad_level" });
    }

    // Compare
    const ok = ANSWERS[level].includes(norm);
    return res.status(200).json({ ok });

  } catch (err) {
    return res.status(200).json({ ok: false, reason: "exception" });
  }
}
