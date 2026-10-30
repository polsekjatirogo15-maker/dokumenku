export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(gasUrl)) {
    return res.status(500).json({
      ok: false,
      error: 'GAS_WEB_APP_URL belum diatur di Vercel atau bukan URL Web App /exec yang valid.'
    });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!payload || typeof payload.fn !== 'string' || !Array.isArray(payload.args)) {
      return res.status(400).json({ ok: false, error: 'Format permintaan tidak valid.' });
    }

    const upstream = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        error: 'Google Apps Script tidak mengembalikan JSON. Pastikan deployment Web App /exec dapat diakses oleh Vercel.'
      });
    }
    return res.status(upstream.ok ? 200 : 502).json(data);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'Gagal menghubungi Google Apps Script: ' + (error && error.message ? error.message : 'kesalahan jaringan')
    });
  }
}
