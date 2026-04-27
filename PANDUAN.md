# 🚀 Panduan Santai Menggunakan VMDock

Halo! Dokumen ini akan menjelaskan dengan bahasa yang gampang dimengerti tentang **apa itu VMDock**, **bagaimana cara kerjanya**, dan **bagaimana cara memakainya** untuk kebutuhan ngoding sehari-hari.

---

## 🤔 Kenapa VMDock Dibuat?

Pernah merasa Docker Desktop di Windows itu berat, sering error, atau nyangkut di isu WSL/Registry? 
Solusi paling stabil sebenarnya adalah menjalankan Docker langsung di OS Linux yang sebenarnya (seperti Ubuntu) lewat virtual machine (VMware). 

**Masalahnya:** Setup Docker di VM supaya bisa nyambung ke folder codingan kita di Windows itu lumayan ribet. Kita harus atur *port forwarding*, *shared folder*, dan koneksi SSH secara manual tiap ganti project. 

**VMDock hadir untuk mengatasi kerepotan itu.** Cukup ketik perintah sederhana, dan VMDock akan "menyambungkan" Windows kamu ke Docker di dalam VM Linux secara otomatis!

---

## 🛠️ Bagaimana Cara Kerjanya?

Cara kerjanya seperti jembatan yang menghubungkan dua dunia:

1. **Jembatan Folder (File Sharing)**: VMDock akan menyuruh VMware untuk membagikan folder project codinganmu di Windows (misal: `C:\project-keren`) ke dalam Linux VM. Jadi, saat kamu *save* file kode di VS Code Windows, file itu juga otomatis terupdate di dalam VM!
2. **Jembatan Perintah (Docker Host)**: VMDock mengatur jalur khusus (via TCP port 2375) agar perintah `docker ps` atau `docker run` yang kamu ketik di Terminal Windows, sebenarnya **dieksekusi** oleh mesin Docker yang ada di dalam Linux VM.
3. **Jembatan Akses (Port Forwarding)**: Saat kamu menjalankan database Postgres (misal port 5432) di VM, VMDock memastikannya bisa kamu akses langsung dari `localhost:5432` di Windows kamu.

Kamu merasa seperti punya Docker Desktop lokal, padahal mesinnya ada di dalam Linux VM!

---

## 🚦 Cara Pakai (Step-by-Step)

### Persiapan Dulu (Cuma Sekali)
1. **Punya Linux VM di VMware**: Pastikan kamu sudah punya Ubuntu/Debian yang nyala di VMware.
2. **Install Docker CLI di Windows**: Kamu butuh CLI-nya saja, bukan Docker Desktop yang berat.
   *(Buka PowerShell as Administrator, lalu ketik: `winget install Docker.DockerCli`)*
3. **Install VMDock**: Buka terminal di folder VMDock ini, ketik `npm link`.

### Langkah 1: Inisiasi Project (`vmdock init`)
Buka terminal (PowerShell/CMD) di folder project codingan kamu, lalu ketik:
```bash
vmdock init
```
VMDock akan nanya-nanya dikit seperti interogasi ramah:
- **IP VM kamu berapa?** (Masukkan IP Ubuntu kamu, misal `192.168.1.100`)
- **Username SSH & Password?** (Agar VMDock bisa masuk dan nyiapin dockernya otomatis)
- **Path Folder?** (Tinggal tekan Enter aja untuk pakai path default)

*Tada!* VMDock akan menginstall Docker di VM kamu (kalau belum ada) dan membuatkan file `vmdock.yml` di folder projectmu.

### Langkah 2: Atur `vmdock.yml`
Buka file `vmdock.yml` yang baru saja dibuat. Di sinilah kamu mendaftarkan aplikasi/database yang kamu butuhkan. Contohnya kalau butuh Redis & Postgres:
```yaml
services:
  redis:
    image: "redis:7-alpine"
    ports: ["6379:6379"]
  postgres:
    image: "postgres:15"
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: "rahasia"
```

### Langkah 3: Nyalakan Mesinnya! (`vmdock up`)
Tinggal ketik perintah sakti ini:
```bash
vmdock up
```
VMDock akan menyuruh VM Linux untuk men-download image Docker yang kamu minta dan menjalankannya. Setelah selesai, database siap dipakai dari Windows kamu lewat `localhost`!

### Langkah 4: Cek Status (`vmdock status`)
Ragu apakah semua sudah nyala dengan benar? Ketik:
```bash
vmdock status
```
Kamu akan melihat centang hijau (✓) rapi yang memberitahu bahwa VM nyambung, Docker nyala, dan service kamu *running*.

### Langkah 5: Selesai Ngoding? Matikan! (`vmdock down`)
Kalau kamu mau hemat RAM VM atau mau ganti project, cukup matikan dengan:
```bash
vmdock down
```

---

## 💡 Tips Tambahan

- **Restart Terminal**: Setelah `vmdock init` pertama kali, jangan lupa **tutup dan buka lagi** terminal kamu supaya environment `DOCKER_HOST` terbaca dengan baik.
- **VMware Shared Folder**: Terkadang kamu harus masuk ke *Settings > Options > Shared Folders* di VMware kamu untuk memastikan folder projectmu benar-benar diizinkan ("Always Enabled").
