// api/check.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Accept both string and object bodies
    let payload = req.body;
    if (payload == null) payload = {};
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload || '{}'); } catch { payload = {}; }
    }

    let { level, answer } = payload;

    // Normalize inputs
    const norm = String(answer || '')
      .trim()
      .toLowerCase()
      .replace(/[ _-]/g, '');

    // Ensure level is an integer
    if (typeof level === 'string' && level.trim() !== '') {
      const parsed = parseInt(level, 10);
      if (!Number.isNaN(parsed)) level = parsed;
    }

    // Answers are set in Vercel → Settings → Environment Variables (Production)
    const ANSWERS = [
      (process.env.A_L1 || 'vr204,vrsuite,virtualreality,vr').split(','),
      (process.env.A_L2 || 'firelab02,firelab,flammability').split(','),
      (process.env.A_L3 || 'mk3s,prusa,3dprinting,3dprintingroom').split(','),
      (process.env.A_L4 || 'motorsport,velocity,composites,motorsportlab').split(','),
      (process.env.A_L5 || 'simulation,simlab,flightsim,lg01').split(','),
      (process.env.A_L6 || '5').split(','),
    ].map(list => list.map(a => a.toLowerCase().replace(/[ _-]/g, '')));

    const inRange = Number.isInteger(level) && level >= 0 && level < ANSWERS.length;
    if (!inRange) {
      return res.status(200).json({ ok: false, reason: 'bad_level' });
    }

    const ok = ANSWERS[level].includes(norm);
    return res.status(200).json({ ok });
  } catch (err) {
    // Don’t leak anything, just signal failure
    return res.status(200).json({ ok: false, reason: 'exception' });
  }
}
