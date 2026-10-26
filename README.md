# Deploy IT Camp 2026 ke Vercel

Paket ini sudah dilengkapi pengaturan Vercel. Tidak membutuhkan proses build, instalasi library, atau server aplikasi. Backend tetap memakai Supabase.

**URL dan publishable key Supabase masih kosong, sesuai permintaan.** Website dapat dideploy untuk melihat tampilannya, tetapi formulir menampilkan “Formulir belum dibuka” sampai Supabase dipasang dan konfigurasi diisi.

## Isi paket ZIP

```text
vercel-ready/
  vercel.json
  .vercelignore
  README.md
  public/
    index.html
    config.js
    app.js, api.js, motion.js, kelompok.js
    style.css, favicon.svg
    fonts/
```

Hanya `public/` yang menjadi website. Data 67 peserta, SQL, hasil tes dan Excel tidak disertakan dalam paket publik. Nomor WhatsApp Naufal Afaf dan sembilan pilihan kelompok sudah terpasang.

## 1. Isi konfigurasi Supabase

Setelah membuat proyek Supabase baru:

1. Jalankan `peserta-web/schema.sql` dari folder proyek asli melalui SQL Editor.
2. Jalankan `database/seed-peserta.sql` dari folder proyek asli untuk memasukkan 67 peserta.
3. Ambil Project URL dan publishable key dari pengaturan Supabase.
4. Jika memakai paket ZIP, buka `public/config.js` di dalam folder hasil ekstrak dan isi:

```js
window.APP_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://ID-PROYEK.supabase.co',
  SUPABASE_ANON_KEY: 'KUNCI_PUBLISHABLE_PROYEK',
  KONTAK_WA: '62895337364474',
  NAMA_KONTAK: 'Naufal Afaf'
});
```

Gunakan kunci publik, bukan kunci rahasia. Jangan mengisi teks contoh di atas sebagai nilai sungguhan.

Paket ini membaca konfigurasi langsung dari `config.js`. Menambahkan Environment Variables di dashboard Vercel saja **tidak mengubah** file tersebut. Setelah mengubah konfigurasi, deploy ulang.

Jika memakai seluruh repository asli, edit `peserta-web/config.js`, lalu jalankan `node tools/package-vercel.mjs` sebelum commit/deploy. Perintah ini menyinkronkan berkas website ke folder `vercel-ready/public`; perintah ini tidak dijalankan oleh Vercel.

## 2. Deploy lewat GitHub dan dashboard Vercel

1. Ekstrak ZIP. Buat repository GitHub **private** dan unggah **isi** folder `vercel-ready`, sehingga `vercel.json` dan `public` berada di tingkat paling atas repository.
2. Di Vercel, pilih **Add New → Project**, lalu import repository tersebut.
3. Gunakan pengaturan berikut. Sebagian akan terbaca dari `vercel.json`:

| Pengaturan | Nilai |
|---|---|
| Framework Preset | Other |
| Root Directory | Akar repository (`./`) |
| Output Directory | `public` |
| Build Command | Kosong / tidak dijalankan |
| Install Command | Kosong / tidak dijalankan |

4. Klik **Deploy**. Buka URL produksi setelah deployment berhasil.

**Jika mengimpor seluruh folder proyek asli**, pertahankan Root Directory `./`. Konfigurasi `vercel.json` di akar proyek sudah menunjuk `vercel-ready/public`, bukan `public`. Pastikan folder `vercel-ready` ikut di-commit. Jangan mengatur Root Directory ke `peserta-web`, karena pengaturan Vercel berada di akar proyek.

## Alternatif: deploy dari folder di komputer

Vercel juga menyediakan CLI. Dari folder hasil ekstrak yang memuat `vercel.json`:

```sh
npx vercel login
npx vercel --prod
```

Ikuti proses login dan pilih akun/proyek milikmu. Jalankan deployment dari folder yang berisi `vercel.json`, bukan dari `public`. Ini memerlukan Node.js dan koneksi internet.

## 3. Periksa sebelum menyebarkan link

- Jika Supabase belum diisi, status “Formulir belum dibuka” memang disengaja.
- Setelah terhubung, progres harus menunjukkan total 67 peserta awal.
- Cari nama dan periksa pilihan kelompok, lalu buka tombol bantuan untuk memastikan nomor WhatsApp benar.
- Uji link dari WhatsApp pada HP. Untuk pengisian sungguhan, gunakan data peserta yang benar atau proyek Supabase uji terpisah.
- Jika pengunjung diminta login Vercel, periksa Deployment Protection untuk URL produksi agar dapat diakses peserta sesuai pengaturan yang kamu pilih.

Konfigurasi sudah menerapkan header keamanan, larangan pengindeksan, dan `no-store` untuk `config.js`. Domain Supabase standar `https://*.supabase.co` diizinkan. Jika memakai domain backend khusus, sesuaikan `connect-src` pada `vercel.json`.

## Status pemeriksaan paket

Paket diperiksa secara lokal untuk kelengkapan aset, kesamaan dengan sumber yang sudah diuji, konfigurasi output, dan tidak adanya berkas peserta/database di folder publik. Deployment Vercel dan koneksi Supabase asli belum dijalankan.

Rujukan: [konfigurasi Vercel](https://vercel.com/docs/project-configuration/vercel-json), [deployment melalui CLI](https://vercel.com/docs/cli/deploy), dan [berkas yang dikecualikan dari deployment](https://vercel.com/docs/deployments/vercel-ignore).
