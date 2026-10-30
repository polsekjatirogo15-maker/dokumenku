/**
 * FOTOKU — Sistem Manajemen Dokumentasi
 * Google Apps Script + Google Sheets + Google Drive
 *
 * Pemasangan:
 * 1. Buat project di https://script.google.com/
 * 2. Tempel file ini ke Code.gs dan index.html ke file HTML bernama "index".
 * 3. Ubah INITIAL_ADMIN_USERNAME dan INITIAL_ADMIN_PASSWORD di bawah.
 * 4. Jalankan setupFOTOKU() sekali dari editor, lalu izinkan akses.
 * 5. Deploy > New deployment > Web app. Execute as: Me.
 *    Who has access: pilih sesuai kebijakan organisasi (mis. akun Google organisasi).
 *
 * Batas upload/download di aplikasi: 8 MB per file untuk menghindari batas payload Apps Script.
 */

const APP_NAME = 'FOTOKU';
const INITIAL_ADMIN_USERNAME = 'luki';
const INITIAL_ADMIN_PASSWORD = 'luki';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SESSION_SECONDS = 21600; // 6 jam
const PROP_FOLDER_ID = 'FOTOKU_FOLDER_ID';
// Folder Drive tujuan yang diberikan pengguna. Akun pemilik script harus punya akses.
const CONFIGURED_ROOT_FOLDER_ID = '1AMURiORmpzbNt8MFev2Nkuj6LHiy5xRO';
const PROP_SHEET_ID = 'FOTOKU_SHEET_ID';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_NAME + ' — Manajemen Dokumentasi')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Jalankan sekali dari editor Apps Script setelah mengganti username/password.
 * Folder Drive dan spreadsheet dibuat otomatis; ID disimpan di Script Properties.
 */
function setupFOTOKU() {
  if (INITIAL_ADMIN_USERNAME.indexOf('GANTI_') === 0 ||
      INITIAL_ADMIN_PASSWORD.indexOf('GANTI_') === 0 ||
      INITIAL_ADMIN_PASSWORD.length < 12) {
    throw new Error('Edit INITIAL_ADMIN_USERNAME dan INITIAL_ADMIN_PASSWORD di Code.gs. Gunakan password kuat minimal 12 karakter.');
  }

  const props = PropertiesService.getScriptProperties();
  // Gunakan folder yang ditentukan pengguna, bukan membuat folder root baru.
  // getFolderById akan menampilkan error jika ID salah atau akun tidak punya akses.
  const folder = DriveApp.getFolderById(CONFIGURED_ROOT_FOLDER_ID);
  props.setProperty(PROP_FOLDER_ID, folder.getId());

  let ss;
  const sheetId = props.getProperty(PROP_SHEET_ID);
  if (sheetId) {
    try { ss = SpreadsheetApp.openById(sheetId); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('FOTOKU - Database Dokumentasi');
    props.setProperty(PROP_SHEET_ID, ss.getId());
    const filesSheet = ss.getSheets()[0];
    filesSheet.setName('Dokumentasi');
    filesSheet.appendRow(['ID', 'Waktu Upload', 'Judul', 'Kategori', 'Tanggal Kegiatan', 'Keterangan', 'Nama File', 'Tipe MIME', 'Ukuran Byte', 'Drive File ID', 'Uploader', 'Status']);
    filesSheet.setFrozenRows(1);
    filesSheet.getRange(1, 1, 1, 12).setFontWeight('bold');
    const usersSheet = ss.insertSheet('Pengguna');
    usersSheet.appendRow(['Username', 'Salt', 'Password Hash', 'Role', 'Aktif', 'Dibuat']);
    usersSheet.setFrozenRows(1);
    usersSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  const userSheet = getSheet_('Pengguna');
  const existing = findUserRow_(INITIAL_ADMIN_USERNAME);
  if (!existing) {
    const salt = Utilities.getUuid().replace(/-/g, '');
    userSheet.appendRow([
      INITIAL_ADMIN_USERNAME,
      salt,
      hashPassword_(INITIAL_ADMIN_PASSWORD, salt),
      'admin',
      true,
      new Date()
    ]);
  }

  // Buat folder kategori agar arsip rapi.
  ['Kegiatan', 'Foto', 'Video', 'Laporan', 'Lainnya'].forEach(name => {
    const it = folder.getFoldersByName(name);
    if (!it.hasNext()) folder.createFolder(name);
  });

  return {
    ok: true,
    message: 'Setup FOTOKU selesai.',
    folderUrl: folder.getUrl(),
    spreadsheetUrl: ss.getUrl(),
    note: 'Simpan URL folder dan spreadsheet. Jangan bagikan folder/database ke publik.'
  };
}

function getAppInfo() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty(PROP_FOLDER_ID) || !props.getProperty(PROP_SHEET_ID)) {
    return { configured: false, appName: APP_NAME };
  }
  return { configured: true, appName: APP_NAME };
}

function login(username, password) {
  username = cleanText_(username, 60);
  password = String(password || '');
  if (!username || !password) throw new Error('Masukkan username dan password.');

  const user = findUserRow_(username);
  if (!user || String(user.values[4]).toLowerCase() !== 'true') {
    throw new Error('Username atau password salah, atau akun tidak aktif.');
  }
  const calculated = hashPassword_(password, user.values[1]);
  if (!constantTimeEqual_(calculated, user.values[2])) {
    throw new Error('Username atau password salah, atau akun tidak aktif.');
  }

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session_' + token, JSON.stringify({
    username: user.values[0],
    role: user.values[3],
    issued: Date.now()
  }), SESSION_SECONDS);
  return { token: token, username: user.values[0], role: user.values[3], expiresIn: SESSION_SECONDS };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('session_' + String(token));
  return { ok: true };
}

function getDashboard(token) {
  const session = requireSession_(token);
  const rows = getDataRows_();
  const active = rows.filter(r => String(r[11]) !== 'Dihapus');
  const byCategory = {};
  active.forEach(r => { const c = String(r[3] || 'Lainnya'); byCategory[c] = (byCategory[c] || 0) + 1; });
  const recent = active.slice(-8).reverse().map(rowToPublic_);
  return {
    user: { username: session.username, role: session.role },
    total: active.length,
    photos: active.filter(r => /^image\//i.test(String(r[7]))).length,
    videos: active.filter(r => /^video\//i.test(String(r[7]))).length,
    reports: active.filter(r => /pdf|word|document|spreadsheet|text/i.test(String(r[7]))).length,
    byCategory: byCategory,
    recent: recent
  };
}

function listDocuments(token, filters) {
  requireSession_(token);
  filters = filters || {};
  const q = cleanText_(filters.query || '', 120).toLowerCase();
  const category = cleanText_(filters.category || '', 50);
  const start = cleanText_(filters.startDate || '', 10);
  const end = cleanText_(filters.endDate || '', 10);
  return getDataRows_().filter(r => String(r[11]) !== 'Dihapus').filter(r => {
    const haystack = [r[2], r[3], r[4], r[5], r[6], r[10]].join(' ').toLowerCase();
    const date = dateString_(r[4]);
    return (!q || haystack.includes(q)) &&
      (!category || String(r[3]) === category) &&
      (!start || date >= start) &&
      (!end || date <= end);
  }).reverse().map(rowToPublic_);
}

function uploadDocument(token, payload) {
  const session = requireSession_(token);
  payload = payload || {};
  const title = cleanText_(payload.title, 150);
  const category = cleanText_(payload.category || 'Lainnya', 50);
  const eventDate = cleanText_(payload.eventDate || '', 10);
  const description = cleanText_(payload.description || '', 1000);
  const fileName = cleanFileName_(payload.fileName || 'file');
  const mimeType = cleanText_(payload.mimeType || 'application/octet-stream', 120);
  const base64 = String(payload.base64 || '');
  if (!title) throw new Error('Judul dokumentasi wajib diisi.');
  if (!base64) throw new Error('Pilih file yang akan diunggah.');
  const estimatedBytes = Math.floor(base64.length * 3 / 4);
  if (estimatedBytes > MAX_FILE_BYTES) throw new Error('Ukuran file melebihi batas 8 MB.');
  if (!['Kegiatan', 'Foto', 'Video', 'Laporan', 'Lainnya'].includes(category)) throw new Error('Kategori tidak valid.');

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Ukuran file melebihi batas 8 MB.');
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = getCategoryFolder_(category);
  const file = folder.createFile(blob);
  file.setDescription('FOTOKU | ' + title + ' | Pengunggah: ' + session.username);

  const id = Utilities.getUuid();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    getSheet_('Dokumentasi').appendRow([
      id, new Date(), title, category, eventDate, description,
      fileName, mimeType, bytes.length, file.getId(), session.username, 'Aktif'
    ]);
  } catch (e) {
    try { file.setTrashed(true); } catch (_) {}
    throw e;
  } finally {
    lock.releaseLock();
  }
  return { ok: true, message: 'File berhasil diunggah.', id: id };
}

function downloadDocument(token, docId) {
  requireSession_(token);
  const record = findDocument_(docId);
  if (!record || String(record[11]) === 'Dihapus') throw new Error('Dokumentasi tidak ditemukan.');
  if (Number(record[8]) > MAX_FILE_BYTES) throw new Error('File terlalu besar untuk diunduh melalui aplikasi. Buka file dari Google Drive.');
  const file = DriveApp.getFileById(String(record[9]));
  const bytes = file.getBlob().getBytes();
  return {
    fileName: String(record[6]),
    mimeType: String(record[7] || 'application/octet-stream'),
    base64: Utilities.base64Encode(bytes)
  };
}

function deleteDocument(token, docId) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Hanya admin yang dapat menghapus dokumentasi.');
  const row = findDocumentRow_(docId);
  if (!row) throw new Error('Dokumentasi tidak ditemukan.');
  const sheet = getSheet_('Dokumentasi');
  const values = sheet.getRange(row, 1, 1, 12).getValues()[0];
  if (String(values[11]) === 'Dihapus') return { ok: true };
  // Soft delete di indeks, lalu pindahkan file ke Sampah Drive.
  try { DriveApp.getFileById(String(values[9])).setTrashed(true); } catch (e) {}
  sheet.getRange(row, 12).setValue('Dihapus');
  return { ok: true, message: 'Dokumentasi dihapus.' };
}

function addUser(token, username, password, role) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Hanya admin yang dapat menambah petugas.');
  username = cleanText_(username, 60);
  password = String(password || '');
  role = role === 'admin' ? 'admin' : 'petugas';
  if (!/^[a-zA-Z0-9._-]{3,60}$/.test(username)) throw new Error('Username 3–60 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  if (password.length < 12) throw new Error('Password harus minimal 12 karakter.');
  if (findUserRow_(username)) throw new Error('Username sudah digunakan.');
  const salt = Utilities.getUuid().replace(/-/g, '');
  getSheet_('Pengguna').appendRow([username, salt, hashPassword_(password, salt), role, true, new Date()]);
  return { ok: true, message: 'Akun petugas berhasil dibuat.' };
}

function listUsers(token) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Hanya admin yang dapat melihat daftar pengguna.');
  const sheet = getSheet_('Pengguna');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues()
    .map(r => ({ username: String(r[0]), role: String(r[3]), active: String(r[4]).toLowerCase() === 'true' }))
    .filter(u => u.username);
}

function setUserActive(token, username, active) {
  const session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('Hanya admin yang dapat mengubah akun.');
  if (String(username) === session.username && !active) throw new Error('Anda tidak dapat menonaktifkan akun yang sedang digunakan.');
  const found = findUserRow_(username);
  if (!found) throw new Error('Pengguna tidak ditemukan.');
  getSheet_('Pengguna').getRange(found.row, 5).setValue(Boolean(active));
  return { ok: true };
}

function getCategoryFolder_(category) {
  const props = PropertiesService.getScriptProperties();
  const root = DriveApp.getFolderById(props.getProperty(PROP_FOLDER_ID));
  const it = root.getFoldersByName(category);
  return it.hasNext() ? it.next() : root.createFolder(category);
}

function requireSession_(token) {
  if (!token) throw new Error('Sesi berakhir. Silakan login kembali.');
  const raw = CacheService.getScriptCache().get('session_' + String(token));
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  return JSON.parse(raw);
}

function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
  if (!id) throw new Error('Aplikasi belum disiapkan. Jalankan setupFOTOKU() dari editor Apps Script.');
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet ' + name + ' tidak ditemukan. Jalankan setupFOTOKU() kembali.');
  return sheet;
}

function getDataRows_() {
  const sheet = getSheet_('Dokumentasi');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
}

function findDocument_(id) {
  const row = findDocumentRow_(id);
  return row ? getSheet_('Dokumentasi').getRange(row, 1, 1, 12).getValues()[0] : null;
}

function findDocumentRow_(id) {
  const sheet = getSheet_('Dokumentasi');
  if (sheet.getLastRow() < 2) return null;
  const cell = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : null;
}

function findUserRow_(username) {
  const sheet = getSheet_('Pengguna');
  if (sheet.getLastRow() < 2) return null;
  const vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const target = String(username).toLowerCase();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).toLowerCase() === target) return { row: i + 2, values: vals[i] };
  }
  return null;
}

function rowToPublic_(r) {
  return {
    id: String(r[0]),
    uploadedAt: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[1] || ''),
    title: String(r[2] || ''),
    category: String(r[3] || ''),
    eventDate: dateString_(r[4]),
    description: String(r[5] || ''),
    fileName: String(r[6] || ''),
    mimeType: String(r[7] || ''),
    size: Number(r[8] || 0),
    uploader: String(r[10] || '')
  };
}

function dateString_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(value).slice(0, 10);
}

function cleanText_(value, max) {
  return String(value == null ? '' : value).replace(/[<>]/g, '').trim().slice(0, max);
}
function cleanFileName_(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|#%{}~&]/g, '_').slice(0, 180) || 'file';
}
function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(salt) + ':' + String(password),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}
function constantTimeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
