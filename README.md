# Trading Analyst

Masukkan screenshot chart, AI (Claude) baca chart dan beri setup BUY dan SELL lengkap dengan entry, SL, TP1-TP3, sebab setiap posisi, trigger dan bila setup batal. Statik, tiada server: data kekal dalam browser (`localStorage`).

## Guna

1. Buka `index.html`, atau `python3 -m http.server 8000`.
2. **Tetapan**: masukkan Anthropic API key, pilih model, baki akaun, risiko % dan unit per lot (XAUUSD 100, forex 100000).
3. **Analisis**: tampal (Ctrl+V), seret atau pilih sehingga 4 screenshot (contoh H4 + H1 + M15), isi simbol/timeframe jika mahu, tekan *Analisis chart*.

## Hasil analisis

- Bias, ringkasan dan struktur pasaran (HH/HL, BOS, CHoCH).
- Setiap setup: arah, jenis order, keyakinan, jadual harga dengan jarak dan R:R setiap TP, rajah paras harga, saiz posisi (unit dan lot ikut risiko anda), sebab masuk, sebab SL dan TP diletak di situ, paras batal.
- Amaran jika susunan SL/entry/TP tidak konsisten dengan arah.
- Paras penting, corak, indikator yang kelihatan, risiko, keputusan akhir.
- *Salin* setup sebagai teks, atau *Masuk jurnal* untuk isi borang jurnal terus.

## Sejarah dan jurnal

- **Sejarah**: 30 analisis terakhir disimpan, klik untuk buka semula.
- **Jurnal**: trade dengan SL/TP, exit kosong bermaksud masih buka. Statistik (win rate, net P/L, profit factor, purata R, drawdown) dan lengkung ekuiti dikira dari trade yang ditutup. Eksport/import CSV.

API key dihantar terus dari browser ke `api.anthropic.com`. Jangan guna di komputer awam.
