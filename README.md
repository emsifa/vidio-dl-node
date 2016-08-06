Vidio-dl
============================================

Node.js command line vidio.com downloader

## Instalasi 

* Pastikan `node.js` sudah terinstall dengan baik: buka cmd/terminal, ketikkan `node --version` dan `npm --version`. Kalau belum silahkan [install](https://nodejs.org/en/).
* Jika kamu pengguna windows, pastikan folder npm terdaftar di variable PATH. Bingung? skip aja, lanjut proses instalasi sampai ke penggunaan, kalau nanti ada error semacam `command blabla not found` [baca ini](http://stackoverflow.com/a/24196273). 
* Masih di cmd/terminal, ketikkan `npm install -g vidio-dl`. Kalau kamu pengguna ubuntu mengalami error `EACCESS`, coba pakai `sudo`.

## Penggunaan

Gunakan perintah `vidio-dl <url> [output]`.

* `url` (required): url video dari vidio.com, contoh: `https://www.vidio.com/watch/12345-blablabla`.
* `output` (opsional): dapat dikosongkan atau diisi sebagai berikut:
	* `path/to/directory/namafile.mp4`: file akan tersimpan di `path/to/directory` dengan nama `namafile.mp4`.
	* `path/to/directory`: file akan tersimpan di `path/to/directory` dengan nama file sesuai dengan judul video.
	* jika dikosongkan file akan tersimpan di direktori yang aktif saat ini dengan nama file sesuai dengan judul video.
