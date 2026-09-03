# Tampilan Ujian TKA untuk Google Forms

Aplikasi Netlify tanpa database yang membaca Google Form publik secara langsung, menampilkan satu soal per layar, lalu meneruskan seluruh jawaban ke endpoint `formResponse` Google Form asli.

Versi 2.4.1 menambahkan deteksi dan pesan khusus untuk Google Form yang mewajibkan login, serta peringatan yang jelas bahwa formulir dengan upload file tidak didukung.

## Menjalankan secara lokal

1. Gunakan Node.js 18 atau lebih baru.
2. Jalankan `npm install`.
3. Login Netlify CLI dengan `npx netlify login`.
4. Hubungkan folder ke situs Netlify dengan `npx netlify link`, lalu jalankan `npm run dev`.

Fungsi pembacaan dan pengiriman tetap membutuhkan Netlify Functions. Karena itu, membuka `index.html` langsung dari File Explorer tidak cukup untuk menguji aplikasi.

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
3. Klik **Baca Formulir**.
4. Isi informasi ujian, pilih tema, lalu atur keamanan dan bunyi peringatan.
5. Klik **Simpan & Buat Link Ujian**, lalu bagikan tautannya.
6. Jika isi Google Form berubah, klik **Baca Ulang** dan simpan kembali konfigurasi.

## Fitur versi 2.2

- Tema Ujian, Bisnis, dan Casual dengan pratinjau serta mode terang/gelap.
- Pemeriksaan koneksi, fullscreen, orientasi, dan jumlah soal sebelum mulai.
- Progress persentase; filter nomor Semua/Belum/Ragu; pencarian soal belum dijawab; mode fokus; dan pengaturan ukuran teks.
- Swipe kiri/kanan untuk navigasi soal pada smartphone.
- Peringatan sisa waktu 10, 5, dan 1 menit dengan bunyi opsional.
- Ringkasan jawaban sebelum submit dan alasan penghentian jika batas pelanggaran tercapai.
- Halaman selesai menyediakan Salin Nomor, Kerjakan Lagi, dan Keluar.
- Jika guru mengaktifkan bukti Ringkas, tombol Unduh PDF Ringkas ditampilkan. PDF tidak memuat teks soal, gambar soal, pilihan lain, kunci, ataupun nilai.
- Gambar yang melekat pada pertanyaan atau ditempatkan sebagai blok sebelum pertanyaan ditampilkan secara responsif. Jika media gagal dimuat, soal tetap berfungsi dan menampilkan pemberitahuan gambar.
- Kerjakan Lagi selalu meminta konfirmasi karena dapat menghasilkan respons Google Form tambahan.

## Catatan teknis

- Tidak ada deteksi atau halaman identitas khusus. Semua field Google Form yang didukung diperlakukan sebagai pertanyaan biasa dan dikirim ke `entry ID` aslinya.
- Jawaban, posisi soal, tanda ragu-ragu, urutan opsi, timer, dan jumlah pelanggaran hanya berada di memori halaman dan langsung hilang ketika halaman dibuka ulang.
- Konfigurasi ujian disimpan di dalam link ujian, bukan di server. Setelah mengubah pengaturan, guru harus membagikan link baru yang dihasilkan.
- Nomor bukti dibuat setelah endpoint Google menerima pengiriman. Nomor tersebut merupakan bukti teknis di layar, bukan nomor respons resmi dari Google karena Google Forms tidak mengembalikan ID respons melalui `formResponse`.
- Token ujian adalah pembatas akses sederhana dan tidak menggantikan autentikasi peserta.
- Pengacakan pilihan berlangsung per sesi peserta; nilai jawaban yang dikirim tetap sama dengan opsi Google Form asli.

## Batasan

- Parser bergantung pada variabel internal `FB_PUBLIC_LOAD_DATA_` milik Google. Perubahan struktur internal Google Forms dapat memerlukan pembaruan parser.
- Tanpa cache, setiap pembukaan dan pengiriman ujian melakukan permintaan langsung ke Google Forms. Trafik peserta yang sangat besar dapat meningkatkan waktu muat atau risiko pembatasan permintaan dari Google.
- Didukung: pilihan ganda, checkbox, dropdown, jawaban singkat, dan paragraf.
- Grid, unggah file, tanggal/waktu, dan skala linear ditampilkan sebagai tipe yang belum didukung.
- Form yang mewajibkan login, membatasi satu respons, mengumpulkan email terverifikasi, atau memakai alur section/percabangan tidak didukung pada versi ini.
- Validasi khusus Google Forms selain status wajib (misalnya pola teks atau batas angka) belum direplikasi di tampilan ujian.
- Jangan gunakan aplikasi ini untuk formulir yang memuat data pribadi sensitif tanpa meninjau kebijakan privasi dan pengelolaan akses Anda.
