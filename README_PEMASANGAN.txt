FOTOKU — Vercel frontend + Google Apps Script backend
POLSEK JATIROGO — POLRESTA TUBAN
Pengembang: masluki.id

ISI PAKET
- index.html       Frontend dashboard yang berjalan di Vercel
- api/gas.js       Proxy API Vercel ke Google Apps Script (HARUS di dalam folder api/)
- vercel.json      Batas waktu fungsi 30 detik untuk upload
- Code.gs          Backend Apps Script (Drive + Sheets)

BAGIAN A — PASANG BACKEND GOOGLE APPS SCRIPT
1. Buka https://script.google.com/ dan buka/buat project FOTOKU.
2. Tempel isi Code.gs dari paket ini ke file Code.gs.
3. Ubah INITIAL_ADMIN_USERNAME dan INITIAL_ADMIN_PASSWORD dengan kredensial kuat milik Anda.
4. Pastikan CONFIGURED_ROOT_FOLDER_ID sesuai folder Drive Anda.
5. Jalankan setupFOTOKU() sekali dan setujui izin yang diminta.
6. Klik Deploy > New deployment > Web app.
   - Execute as: Me
   - Who has access: Anyone (karena Vercel memanggil API sebagai server; keamanan login aplikasi tetap wajib).
   Catatan: memilih Anyone berarti endpoint dapat dijangkau publik. Fungsi API membatasi aksi ke daftar yang diizinkan dan semua aksi data memerlukan token login, tetapi URL ini tetap harus dirahasiakan dari publik yang tidak perlu. Jangan pernah mengirim token Google OAuth ke frontend.
7. Klik Deploy, salin URL yang berakhir /exec.

BAGIAN B — PASANG FRONTEND DI VERCEL
1. Di repositori Vercel, ganti file frontend utama dengan index.html dari paket ini.
2. Tambahkan folder api dan file api/gas.js dari paket ini. Struktur minimal:
   index.html
   api/gas.js
3. Di Vercel, buka Project > Settings > Environment Variables.
4. Tambahkan variable:
   Name: GAS_WEB_APP_URL
   Value: URL Web App Apps Script yang berakhir /exec
   Pilih Production (dan Preview bila dibutuhkan).
5. Simpan lalu lakukan Redeploy.
6. Buka URL Vercel dan coba login.

PENTING
- Jangan menaruh URL GAS sebagai secret di HTML; simpan hanya di Environment Variables Vercel.
- Frontend Vercel tidak bisa menggunakan google.script.run. Semua panggilan sekarang lewat /api/gas.
- Upload dibatasi 3 MB per file agar permintaan base64 tidak melewati batas payload Vercel Functions.
- Endpoint Apps Script disetel dapat diakses publik agar proxy server Vercel dapat memanggilnya; akun dan data tetap dilindungi token login aplikasi. Untuk lingkungan resmi, gunakan pengamanan tambahan dan uji akses sebelum data produksi.
- Jangan membagikan username/password admin, URL database Sheet, atau token sesi.


CEK CEPAT JIKA ADA ERROR
- Buka https://DOMAIN-ANDA.vercel.app/api/gas di browser. Harus tampil {"ok":true,"proxy":"aktif","gasUrlTerpasang":true}.
  Jika 404 -> file api/gas.js belum ada di repo (penyebab error 'Respons backend tidak valid').
  Jika gasUrlTerpasang false -> isi GAS_WEB_APP_URL di Vercel lalu Redeploy.
- Setelah mengubah Code.gs, buat Deploy > Manage deployments > Edit > New version agar perubahan aktif.
