// Proxy Vercel -> Google Apps Script Web App (CommonJS agar aman tanpa package.json)
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    // Cek cepat dari browser: buka /api/gas untuk memastikan fungsi ini aktif.
    return res.status(200).json({ ok: true, proxy: 'aktif', gasUrlDiVercel: !!process.env.GAS_WEB_APP_URL });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method tidak diizinkan.' });
  }

  const URLRE = /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+\/|macros\/)s\/[\w-]+\/exec$/;
  try {
    let payload = req.body;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    if (!payload || typeof payload.fn !== 'string' || !Array.isArray(payload.args)) {
      return res.status(400).json({ ok: false, error: 'Format permintaan tidak valid.' });
    }

    // Link dari menu Database (dibatasi hanya ke Google Apps Script); cadangan: variabel Vercel.
    const gasUrl = String(payload.gasUrl || process.env.GAS_WEB_APP_URL || '').trim();
    if (!URLRE.test(gasUrl)) {
      return res.status(400).json({ ok: false, error: 'Link Google Script belum diisi atau tidak valid. Isi di menu Database.' });
    }
    const forward = { fn: payload.fn, args: payload.args, secret: String(payload.secret || '') };

    const upstream = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(forward),
      redirect: 'follow'
    });
    const raw = await upstream.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return res.status(502).json({
        ok: false,
        error: 'Apps Script tidak mengembalikan JSON. Deploy ulang Web App (Who has access: Anyone) dan pastikan URL /exec benar.'
      });
    }
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'Gagal menghubungi Google Apps Script: ' + (error && error.message ? error.message : 'kesalahan jaringan')
    });
  }
};
