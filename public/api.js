const config = window.APP_CONFIG || {};
const key = String(config.SUPABASE_ANON_KEY || '').trim();
const base = String(config.SUPABASE_URL || '').trim().replace(/\/+$/, '');
export const configured = Boolean(base && key && !key.startsWith('sb_secret_'));

export class ApiError extends Error {
  constructor(code, { uncertain = false } = {}) {
    super(code);
    this.code = code;
    this.uncertain = uncertain;
  }
}

// Satu pintu akses data: semua permintaan lewat RPC, tanpa akses tabel langsung.
export async function rpc(name, body = {}, { signal, write = false } = {}) {
  if (!configured) throw new ApiError('BELUM_SIAP');
  const controller = new AbortController();
  const relayAbort = () => controller.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    let data;
    try { data = await response.json(); }
    catch { throw new ApiError('RESPONS_TIDAK_VALID', { uncertain: write }); }
    if (!response.ok) {
      const known = ['NIM_TIDAK_VALID', 'KELAS_TIDAK_VALID', 'KELOMPOK_TIDAK_VALID', 'NIM_SUDAH_DIPAKAI', 'NAMA_SUDAH_DIISI', 'PESERTA_TIDAK_ADA'];
      const code = known.find(item => data?.message === item);
      throw new ApiError(code || 'SERVER_BERMASALAH', { uncertain: write && !code });
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Pencarian dibatalkan', 'AbortError');
    if (error instanceof ApiError) throw error;
    throw new ApiError('JARINGAN', { uncertain: write });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', relayAbort);
  }
}
