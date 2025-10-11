// api/check.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { level, answer } = JSON.parse(req.body || '{}');
    const norm = String(answer || '')
      .trim()
      .toLowerCase()
      .replace(/[ _-]/g, '');

    const ANSWERS = [
      (process.env.A_L1 || 'vr204,vrsuite,virtualreality,vr').split(','),
      (process.env.A_L2 || 'firelab02,firelab,flammability').split(','),
      (process.env.A_L3 || 'mk3s,prusa,3dprinting,3dprintingroom').split(','),
      (process.env.A_L4 || 'motorsport,velocity,composites,motorsportlab').split(','),
      (process.env.A_L5 || 'simulation,simlab,flightsim,lg01').split(','),
      (process.env.A_L6 || '5').split(','),
    ].map(list => list.map(a => a.toLowerCase().replace(/[ _-]/g, '')));

    const ok =
      Number.isInteger(level) &&
      level >= 0 &&
      level < ANSWERS.length &&
      ANSWERS[level].includes(norm);

    res.status(200).json({ ok });
  } catch (err) {
    res.status(400).json({ ok: false });
  }
}
