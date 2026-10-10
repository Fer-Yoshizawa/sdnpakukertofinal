# js/vendor — pustaka pihak ketiga (sudah di-bundle)

## `supabase-bundle.js`

`@supabase/supabase-js` **v2.117.3** (lisensi Apache-2.0), di-bundle jadi
satu file ESM mandiri (222 KB, minified) memakai esbuild.

Kenapa dibundle, bukan dipakai langsung dari CDN:

- Tidak bergantung pada jsDelivr/esm.sh — penting untuk app Android yang
  dipakai di jaringan yang suka memblokir CDN.
- Tidak ada import bare / file terpecah — satu file, jalan apa adanya lewat
  `import()` dinamis dari `js/absen.js`.
- Kode aplikasi tidak perlu bundler/build step; folder ini tinggal ikut
  tersinkron ke `www/`.

## Cara memperbaruinya

Dari folder proyek (butuh Node + internet):

```bash
npm i --no-save @supabase/supabase-js
npx esbuild --bundle --format=esm --minify --platform=browser \
  "@supabase/supabase-js" \
  --outfile=js/vendor/supabase-bundle.js
```

Lalu sinkronkan ke app Android:

```bash
cp js/vendor/supabase-bundle.js www/js/vendor/
npx cap sync android
```

Jangan edit file ini dengan tangan — hasil build, bisa digenerate ulang
kapan saja.
