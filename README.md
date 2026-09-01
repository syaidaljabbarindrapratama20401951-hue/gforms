# Tampilan Ujian TKA untuk Google Forms

Aplikasi Netlify tanpa database yang membaca Google Form publik, menyimpan struktur soal di Netlify Blobs, menampilkan satu soal per layar, lalu meneruskan seluruh jawaban ke endpoint `formResponse` Google Form asli.

## Menjalankan secara lokal

1. Gunakan Node.js 18 atau lebih baru.
2. Jalankan `npm install`.
3. Login Netlify CLI dengan `npx netlify login`.
4. Hubungkan folder ke situs Netlify dengan `npx netlify link`, lalu jalankan `npm run dev`.

Netlify Blobs membutuhkan konteks situs Netlify. Karena itu, membuka `index.html` langsung dari File Explorer tidak cukup untuk menguji fungsi cache dan submit.

## Deploy ke Netlify

### Melalui GitHub

1. Unggah seluruh folder ini ke repositori GitHub.
2. Di Netlify, pilih **Add new site → Import an existing project**.
3. Pilih repositori. Netlify membaca `netlify.toml` secara otomatis.
4. Deploy. Tidak diperlukan build command atau environment variable.

### Melalui Netlify CLI

```bash
npm install
npx netlify login
npx netlify init
npx netlify deploy --prod
```

Drag-and-drop folder mentah di halaman Netlify Drop tidak selalu menyertakan proses instalasi dependency Functions. Untuk proyek ini, GitHub atau Netlify CLI lebih disarankan.

## Alur penggunaan

1. Atur Google Form agar dapat dibuka dan diisi tanpa login.
2. Tempel tautannya di halaman admin.
3. Atur durasi; isi `0` untuk tanpa timer.
4. Klik **Proses / Generate** dan bagikan tautan ujian.
5. Jika isi Google Form berubah, klik **Generate Ulang / Refresh Cache**.

## Batasan

- Parser bergantung pada variabel internal `FB_PUBLIC_LOAD_DATA_` milik Google. Perubahan struktur internal Google Forms dapat memerlukan pembaruan parser.
- Didukung: pilihan ganda, checkbox, dropdown, jawaban singkat, dan paragraf.
- Grid, unggah file, tanggal/waktu, dan skala linear ditampilkan sebagai tipe yang belum didukung.
- Form yang mewajibkan login, membatasi satu respons, mengumpulkan email terverifikasi, atau memakai alur section/percabangan tidak didukung pada versi ini.
- Validasi khusus Google Forms selain status wajib (misalnya pola teks atau batas angka) belum direplikasi di tampilan ujian.
- Jangan gunakan aplikasi ini untuk formulir yang memuat data pribadi sensitif tanpa meninjau kebijakan privasi dan pengelolaan akses Anda.
