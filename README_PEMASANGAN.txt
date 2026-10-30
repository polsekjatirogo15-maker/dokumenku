FOTOKU — Polsek Jatirogo / Polresta Tuban (pengembang: masluki.id)

ISI PAKET (hanya 2 file yang dipakai)
- index.html  Frontend di Vercel (memanggil Google Apps Script langsung dari browser)
- Code.gs     Backend Google Apps Script (Drive + Sheets)
- vercel.json Boleh kosong ({}); tidak ada folder api/ lagi.

BACKEND (Apps Script)
1. Tempel Code.gs ke project Apps Script. Ganti SECRET_CODE (min. 8 karakter).
2. Jalankan setupFOTOKU() sekali dan setujui izin.
3. Deploy > Manage deployments > Edit > New version > Deploy. Execute as: Me, Who has access: Anyone.
4. Buka link /exec di browser: harus tampil {"ok":true,"backend":"aktif","configured":true}

FRONTEND (Vercel)
1. Upload index.html dan vercel.json ke GitHub (replace). Tunggu deploy selesai.
2. Buka website > menu Database > isi link /exec dan kode rahasia > Tes koneksi > Simpan.
Pengaturan tersimpan di browser tiap perangkat. Batas upload 3 MB per file.
