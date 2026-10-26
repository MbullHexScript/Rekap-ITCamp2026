import { rpc, configured } from './api.js';
import { KELOMPOK } from './kelompok.js';
import { celebrate, bindTilt } from './motion.js';

const $ = id => document.getElementById(id);
const config = window.APP_CONFIG || {};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let selected = null;
let lastRecord = null;
let searchVersion = 0;
let searchAbort;
let debounce;
let modalOpen = false;
let busy = false;
let uncertain = false;
let pendingPayload = null;
let detailVersion = 0;
let opener;
let savedScroll = 0;
let currentStep = 1;

function waUrl(kind, record = selected) {
  let phone = String(config.KONTAK_WA || '').replace(/\D/g, '');
  if (phone.startsWith('0')) phone = `62${phone.slice(1)}`;
  const contact = config.NAMA_KONTAK || 'panitia';
  const messages = {
    general: `Halo ${contact}, saya ingin bertanya tentang pengisian data peserta IT Camp 2026.`,
    missing: `Halo ${contact}, nama saya tidak ditemukan di daftar 67 peserta IT Camp 2026. Nama lengkap saya: …\nSaya akan melampirkan bukti pembayaran dan bukti foto keikutsertaan event untuk diverifikasi.`,
    correction: `Halo ${contact}, saya ingin mengonfirmasi data IT Camp 2026 atas nama ${record?.nama || '…'}. Data yang tercatat tidak sesuai / sudah diisi orang lain. Mohon bantuan verifikasinya.\nNIM, kelas, dan kelompok yang benar: …`
  };
  return `https://wa.me/${phone}?text=${encodeURIComponent(messages[kind] || messages.general)}`;
}

function updateLinks(record = selected) {
  document.querySelectorAll('[data-wa]').forEach(link => {
    link.href = waUrl(link.dataset.wa, record);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
}
document.querySelectorAll('[data-contact]').forEach(node => { node.textContent = config.NAMA_KONTAK || 'panitia'; });
updateLinks();
for (const name of KELOMPOK) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  $('kelompok').append(option);
}
if (config.DEMO_MODE) $('demo-banner').hidden = false;

function step(value) {
  currentStep = value;
  document.querySelectorAll('[data-step]').forEach(node => {
    const index = Number(node.dataset.step);
    node.classList.toggle('done', index < value);
    if (index === value) node.setAttribute('aria-current', 'step');
    else node.removeAttribute('aria-current');
  });
}

function buzz(success = false) {
  if (!reducedMotion.matches && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(success ? [20, 35, 20] : 25); } catch { /* Haptics are optional. */ }
  }
}

async function loadProgress() {
  $('progress-retry').hidden = true;
  try {
    const data = await rpc('statistik');
    const { total, terisi } = data?.[0] || {};
    if (!Number.isInteger(total) || !Number.isInteger(terisi) || total < 0 || terisi < 0 || terisi > total) throw Error('Invalid progress');
    $('progress-label').textContent = `${terisi} dari ${total} sudah mengisi`;
    $('total-count').textContent = String(total);
    $('progress-percent').textContent = `${Math.round(total ? terisi / total * 100 : 0)}%`;
    $('progress-fill').style.transform = `scaleX(${total ? terisi / total : 0})`;
    $('progress').setAttribute('aria-valuemax', String(total || 1));
    $('progress').setAttribute('aria-valuenow', String(terisi));
    $('progress').setAttribute('aria-valuetext', `${terisi} dari ${total} sudah mengisi`);
  } catch {
    $('progress-label').textContent = 'Progres belum bisa dimuat.';
    $('progress-percent').textContent = '';
    $('progress').removeAttribute('aria-valuenow');
    $('progress-retry').hidden = false;
  }
}
$('progress-retry').addEventListener('click', loadProgress);

function clearResults() {
  $('results').replaceChildren();
  $('empty-state').hidden = true;
  $('search-error').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
}

function showSkeleton() {
  clearResults();
  $('results').setAttribute('aria-busy', 'true');
  for (let i = 0; i < 3; i++) {
    const box = document.createElement('div');
    box.className = 'skeleton';
    box.setAttribute('aria-hidden', 'true');
    box.append(document.createElement('span'), document.createElement('span'));
    $('results').append(box);
  }
}

function highlight(node, name, query) {
  const index = name.toLocaleLowerCase('id').indexOf(query.toLocaleLowerCase('id'));
  if (index < 0) { node.textContent = name; return; }
  const mark = document.createElement('mark');
  mark.textContent = name.slice(index, index + query.length);
  node.append(document.createTextNode(name.slice(0, index)), mark, document.createTextNode(name.slice(index + query.length)));
}

function renderResults(rows, query) {
  clearResults();
  $('search-status').textContent = rows.length
    ? `${rows.length} nama ditemukan.${rows.length === 8 ? ' Perjelas nama jika belum terlihat.' : ' Pilih nama yang sesuai.'}`
    : 'Belum ada nama yang cocok. Coba bagian nama yang lain.';
  $('empty-state').hidden = rows.length !== 0;
  for (const row of rows) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `result${row.sudah_diisi ? ' filled' : ''}`;
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'result-name';
    highlight(name, row.nama, query);
    const status = document.createElement('span');
    status.className = 'result-status';
    status.textContent = row.sudah_diisi ? 'Sudah terisi · Periksa data' : 'Belum terisi · Lengkapi data';
    text.append(name, status);
    const arrow = document.createElement('span');
    arrow.className = 'result-arrow';
    arrow.textContent = row.sudah_diisi ? '↗' : '→';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(text, arrow);
    button.addEventListener('click', () => openParticipant(row, button));
    $('results').append(button);
  }
}

async function search(query, version) {
  if (!configured) return;
  showSkeleton();
  $('search-status').textContent = 'Mencari namamu…';
  const controller = new AbortController();
  searchAbort = controller;
  try {
    const data = await rpc('cari_nama', { q: query }, { signal: controller.signal });
    if (version !== searchVersion) return;
    if (!Array.isArray(data) || data.some(row => !Number.isInteger(row.id) || typeof row.nama !== 'string' || typeof row.sudah_diisi !== 'boolean')) throw Error('Invalid results');
    renderResults(data.slice(0, 8), query);
  } catch (error) {
    if (version !== searchVersion || error.name === 'AbortError') return;
    clearResults();
    $('search-status').textContent = 'Pencarian belum berhasil.';
    $('search-error').hidden = false;
    $('search-error-text').textContent = 'Nama belum bisa dimuat. Periksa koneksi internetmu, lalu coba lagi.';
  }
}

function scheduleSearch(immediate = false) {
  clearTimeout(debounce);
  searchAbort?.abort();
  const version = ++searchVersion;
  const query = $('search').value.trim();
  clearResults();
  if (Array.from(query).length < 3) {
    $('search-status').textContent = query ? 'Tambahkan huruf hingga minimal 3 karakter.' : 'Pilih namamu untuk mengisi atau memeriksa data.';
    return;
  }
  if (immediate) search(query, version);
  else debounce = setTimeout(() => search(query, version), 300);
}
$('search').addEventListener('input', () => scheduleSearch());
$('search-retry').addEventListener('click', () => scheduleSearch(true));

function setBusy(value, label = 'Menyimpan…') {
  busy = value;
  $('submit').disabled = value;
  $('submit-label').textContent = value ? label : 'Simpan data saya';
  $('submit').querySelector('.spinner').hidden = !value;
  $('entry-form').setAttribute('aria-busy', String(value));
  for (const id of ['nim', 'kelompok', 'close-sheet', 'not-me', 'form-retry', 'inspect-existing']) $(id).disabled = value;
  document.querySelectorAll('[name=kelas]').forEach(input => { input.disabled = value; });
}

function clearFieldError(id) {
  $(`${id}-error`).textContent = '';
  if (id === 'kelas') document.querySelectorAll('[name=kelas]').forEach(input => input.removeAttribute('aria-invalid'));
  else $(id).removeAttribute('aria-invalid');
}

function fieldError(id, message, shake = true) {
  $(`${id}-error`).textContent = message;
  const target = id === 'kelas' ? $('class-options') : $(id);
  if (id === 'kelas') document.querySelectorAll('[name=kelas]').forEach(input => input.setAttribute('aria-invalid', 'true'));
  else target.setAttribute('aria-invalid', 'true');
  if (shake && !reducedMotion.matches) {
    target.classList.remove('shake');
    void target.offsetWidth;
    target.classList.add('shake');
  }
}

function clearAlert() {
  $('form-alert').hidden = true;
  $('form-retry').hidden = true;
  $('form-wa').hidden = true;
  $('inspect-existing').hidden = true;
}

function alertForm(message, { retry = false, inspect = false, contact = false } = {}) {
  $('form-alert-text').textContent = message;
  $('form-alert').hidden = false;
  $('form-retry').hidden = !retry;
  $('inspect-existing').hidden = !inspect;
  $('form-wa').hidden = !contact;
  $('form-alert').scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

function revealModal() {
  modalOpen = true;
  $('sheet-layer').hidden = false;
  $('page').inert = true;
  savedScroll = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScroll}px`;
  document.body.style.width = '100%';
  requestAnimationFrame(() => {
    if (!modalOpen) return;
    $('sheet-layer').classList.add('open');
    $('sheet-title').focus({ preventScroll: true });
  });
  step(2);
}

function hideModal() {
  if (!modalOpen) return;
  modalOpen = false;
  detailVersion++;
  $('sheet-layer').classList.remove('open');
  $('sheet-layer').hidden = true;
  $('page').inert = false;
  $('sheet').style.transform = '';
  $('sheet').style.transition = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, savedScroll);
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  else $('search').focus({ preventScroll: true });
}

function requestClose() {
  if (busy) return;
  if (history.state?.itcamp === 'sheet') history.back();
  else { hideModal(); step(1); }
}

function openParticipant(row, button) {
  selected = { ...row };
  opener = button;
  uncertain = false;
  pendingPayload = null;
  $('entry-form').reset();
  ['nim', 'kelas', 'kelompok'].forEach(clearFieldError);
  $('nim-count').textContent = '0 digit';
  $('class-indicator').hidden = true;
  clearAlert();
  $('selected-name').textContent = row.nama;
  $('sheet-title').textContent = row.sudah_diisi ? 'Cek datamu dulu' : 'Ini kamu?';
  $('sheet-description').textContent = row.sudah_diisi ? 'Namamu sudah terisi. Pastikan NIM, kelas, dan kelompoknya benar.' : 'Pastikan namanya benar, lalu lengkapi data di bawah.';
  $('entry-form').hidden = row.sudah_diisi;
  $('detail-state').hidden = !row.sudah_diisi;
  updateLinks();
  history.pushState({ itcamp: 'sheet' }, '', location.href);
  revealModal();
  if (row.sudah_diisi) loadDetail();
}

function validRecord(row) {
  return row && Number.isInteger(row.id) && typeof row.nama === 'string' && /^\d{9,10}$/.test(row.nim) && ['A', 'B', 'C'].includes(row.kelas) && KELOMPOK.includes(row.kelompok);
}

async function readRecord(id) {
  const rows = await rpc('cek_data', { p_id: id });
  if (!Array.isArray(rows) || rows.length > 1 || (rows.length && (!validRecord(rows[0]) || rows[0].id !== id))) throw Error('Invalid participant');
  return rows[0] || null;
}

async function loadDetail() {
  const version = ++detailVersion;
  const id = selected.id;
  $('entry-form').hidden = true;
  $('detail-state').hidden = false;
  $('sheet-title').textContent = 'Cek datamu dulu';
  $('sheet-description').textContent = 'Namamu sudah terisi. Pastikan NIM, kelas, dan kelompoknya benar.';
  $('detail-content').hidden = true;
  $('detail-retry').hidden = true;
  $('detail-status').textContent = 'Memuat data yang tersimpan…';
  try {
    const row = await readRecord(id);
    if (!modalOpen || version !== detailVersion) return;
    if (!row) {
      $('detail-status').textContent = 'Data belum terisi atau sedang diperbarui panitia. Kembali ke pencarian lalu pilih namamu lagi.';
      return;
    }
    $('detail-status').textContent = 'Data yang saat ini tercatat:';
    $('detail-nim').textContent = row.nim;
    $('detail-kelas').textContent = row.kelas;
    $('detail-kelompok').textContent = row.kelompok;
    $('detail-content').hidden = false;
  } catch {
    if (!modalOpen || version !== detailVersion) return;
    $('detail-status').textContent = 'Data belum bisa dimuat. Periksa koneksimu, lalu coba lagi.';
    $('detail-retry').hidden = false;
  }
}

$('detail-retry').addEventListener('click', loadDetail);
$('inspect-existing').addEventListener('click', loadDetail);
for (const id of ['close-sheet', 'not-me', 'detail-done', 'sheet-backdrop']) $(id).addEventListener('click', requestClose);

window.addEventListener('popstate', () => {
  if (busy) {
    history.pushState({ itcamp: 'sheet' }, '', location.href);
    return;
  }
  if (history.state?.itcamp === 'sheet' && selected) {
    $('success-screen').hidden = true;
    $('search-screen').hidden = false;
    if (!modalOpen) revealModal();
  } else if (history.state?.itcamp === 'success' && lastRecord) {
    hideModal();
    showSuccess(lastRecord, false);
  } else {
    hideModal();
    $('success-screen').hidden = true;
    $('search-screen').hidden = false;
    step(1);
    if (configured && $('search').value.trim().length >= 3) scheduleSearch(true);
  }
});

document.addEventListener('keydown', event => {
  if (!modalOpen) return;
  if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
  if (event.key === 'Tab') {
    const nodes = [...$('sheet').querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
      .filter(node => node.getClientRects().length && !node.closest('[hidden]'));
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first) { event.preventDefault(); $('sheet').focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !nodes.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !nodes.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
  }
});
document.addEventListener('focusin', event => {
  if (modalOpen && !$('sheet').contains(event.target)) $('sheet-title').focus({ preventScroll: true });
});

let dragStart = null;
$('drag-handle').addEventListener('pointerdown', event => {
  if (busy) return;
  dragStart = event.clientY;
  $('drag-handle').setPointerCapture(event.pointerId);
  $('sheet').style.transition = 'none';
});
$('drag-handle').addEventListener('pointermove', event => {
  if (dragStart === null || reducedMotion.matches) return;
  $('sheet').style.transform = `translateY(${Math.max(0, event.clientY - dragStart)}px)`;
});
function endDrag(event) {
  if (dragStart === null) return;
  const distance = event.clientY - dragStart;
  dragStart = null;
  $('sheet').style.transition = '';
  $('sheet').style.transform = '';
  if (event.type !== 'pointercancel' && distance > 85) requestClose();
}
$('drag-handle').addEventListener('pointerup', endDrag);
$('drag-handle').addEventListener('pointercancel', endDrag);

$('nim').addEventListener('input', () => {
  const raw = $('nim').value;
  $('nim').value = raw.replace(/\D/g, '').slice(0, 10);
  const count = $('nim').value.length;
  $('nim-count').textContent = `${count} digit`;
  clearFieldError('nim');
  if (raw !== $('nim').value) fieldError('nim', 'NIM hanya memakai angka 0–9.', false);
  else if (count > 0 && count < 9) fieldError('nim', `Masih kurang ${9 - count} angka untuk minimal 9 digit.`, false);
});
document.querySelectorAll('[name=kelas]').forEach((input, index) => input.addEventListener('change', () => {
  $('class-indicator').hidden = false;
  $('class-indicator').style.transform = `translateX(${index * 100}%)`;
  clearFieldError('kelas');
}));
$('kelompok').addEventListener('change', () => clearFieldError('kelompok'));

function validate() {
  const nim = $('nim').value;
  const kelas = $('entry-form').elements.kelas.value;
  const kelompok = $('kelompok').value;
  ['nim', 'kelas', 'kelompok'].forEach(clearFieldError);
  let focus;
  if (!/^\d{9,10}$/.test(nim)) { fieldError('nim', 'NIM harus terdiri dari 9–10 angka. Periksa kembali NIM kampusmu.'); focus = $('nim'); }
  if (!['A', 'B', 'C'].includes(kelas)) { fieldError('kelas', 'Pilih kelas A, B, atau C.'); focus ||= document.querySelector('[name=kelas]'); }
  if (!KELOMPOK.includes(kelompok)) { fieldError('kelompok', 'Pilih kelompok IT Camp kamu.'); focus ||= $('kelompok'); }
  if (focus) { buzz(); focus.focus(); return null; }
  return { p_id: selected.id, p_nim: nim, p_kelas: kelas, p_kelompok: kelompok };
}

function showSuccess(record, animate = true) {
  lastRecord = record;
  hideModal();
  $('search-screen').hidden = true;
  $('success-screen').hidden = false;
  for (const key of ['name', 'nim', 'kelas', 'kelompok']) $('success-' + key).textContent = key === 'name' ? record.nama : record[key];
  step(3);
  updateLinks(record);
  $('success-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (animate) { celebrate(); buzz(true); }
  loadProgress();
}

function finish(record) {
  setBusy(false);
  uncertain = false;
  pendingPayload = null;
  history.replaceState({ itcamp: 'success' }, '', location.href);
  showSuccess(record);
}

// A failed response does not prove a failed write. Reconcile before any retry.
async function reconcile() {
  try {
    const row = await readRecord(pendingPayload.p_id);
    if (row) {
      const same = row.nim === pendingPayload.p_nim && row.kelas === pendingPayload.p_kelas && row.kelompok === pendingPayload.p_kelompok;
      if (same) { finish(row); return 'saved'; }
      uncertain = false;
      alertForm('Nama ini sudah memiliki data yang berbeda dari isianmu. Periksa data yang tersimpan, lalu konfirmasikan kepada panitia jika keliru.', { inspect: true, contact: true });
      return 'conflict';
    }
    uncertain = false;
    return 'empty';
  } catch {
    alertForm('Status penyimpanan belum bisa dipastikan. Isianmu tetap ada di halaman ini. Periksa koneksi lalu coba lagi; kami akan mengecek data sebelum mengirim ulang.', { retry: true, contact: true });
    return 'unknown';
  }
}

async function submit(event) {
  event?.preventDefault();
  if (busy) return;
  const payload = validate();
  if (!payload) return;
  clearAlert();
  setBusy(true, uncertain ? 'Memeriksa data…' : 'Menyimpan…');
  try {
    if (uncertain) {
      const status = await reconcile();
      if (status !== 'empty') return;
    }
    pendingPayload = payload;
    const result = await rpc('isi_data', payload, { write: true });
    if (result !== true) throw Object.assign(Error('Respons tidak valid'), { uncertain: true });
    finish({ id: payload.p_id, nama: selected.nama, nim: payload.p_nim, kelas: payload.p_kelas, kelompok: payload.p_kelompok });
  } catch (error) {
    buzz();
    if (error.uncertain) {
      uncertain = true;
      $('submit-label').textContent = 'Memeriksa data…';
      const status = await reconcile();
      if (status === 'empty') alertForm('Data belum tercatat saat diperiksa. Isianmu tetap ada. Periksa koneksi internet, lalu coba lagi.', { retry: true, contact: true });
    } else {
      uncertain = false;
      const errors = {
        NIM_TIDAK_VALID: ['nim', 'NIM harus terdiri dari 9–10 angka. Periksa NIM kampusmu.'],
        KELAS_TIDAK_VALID: ['kelas', 'Kelas belum sesuai. Pilih A, B, atau C.'],
        KELOMPOK_TIDAK_VALID: ['kelompok', 'Kelompok belum sesuai. Pilih kelompok dari daftar.'],
        NIM_SUDAH_DIPAKAI: ['nim', 'NIM ini sudah dipakai pada nama lain. Periksa angkanya; jika benar, hubungi panitia.']
      };
      if (errors[error.code]) {
        const [field, message] = errors[error.code];
        fieldError(field, message);
        // Re-enable inputs before focusing a server validation error.
        setBusy(false);
        (field === 'kelas' ? document.querySelector('[name=kelas]') : $(field)).focus();
        if (error.code === 'NIM_SUDAH_DIPAKAI') alertForm('Jika NIM yang kamu masukkan sudah benar, minta panitia memeriksa data.', { contact: true });
      } else if (error.code === 'NAMA_SUDAH_DIISI') {
        alertForm('Nama ini sudah terisi. Periksa NIM, kelas, dan kelompok yang tersimpan sebelum menghubungi panitia.', { inspect: true, contact: true });
      } else if (error.code === 'PESERTA_TIDAK_ADA') {
        alertForm('Nama ini tidak lagi tersedia. Kembali ke pencarian atau hubungi panitia.', { contact: true });
      } else {
        alertForm('Data belum bisa disimpan. Coba lagi atau hubungi panitia jika kendala berlanjut.', { retry: true, contact: true });
      }
    }
  } finally { setBusy(false); }
}
$('entry-form').addEventListener('submit', submit);
$('form-retry').addEventListener('click', submit);
$('back-search').addEventListener('click', () => {
  if (history.state?.itcamp === 'success') history.back();
  else {
    $('success-screen').hidden = true;
    $('search-screen').hidden = false;
    step(1);
    $('search').focus();
  }
});

bindTilt($('participant-card'));
window.addEventListener('online', () => {
  if (!configured) return;
  loadProgress();
  if (currentStep === 1 && !$('search-error').hidden) scheduleSearch(true);
});
if (configured) loadProgress();
else {
  $('setup-notice').hidden = false;
  $('search').disabled = true;
  $('progress-label').textContent = '67 peserta dalam daftar · pengisian belum dibuka';
}
