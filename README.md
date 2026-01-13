# Smart Document Search System

Akıllı doküman arama ve soru-cevap sistemi. PDF ve TXT dosyalarını yükleyip, içeriklerinde arama yapabilir, dokümanlar hakkında soru sorabilir ve otomatik özetler oluşturabilirsiniz.

## Özellikler

- **Doküman Yükleme**: PDF ve TXT formatındaki dosyaları yükleyebilirsiniz
- **Doküman Listeleme**: Yüklenen tüm dokümanları görüntüleyebilir ve yönetebilirsiniz
- **Gelişmiş Arama**: FTS5 (Full-Text Search) ile doküman içeriklerinde hızlı arama
- **Soru-Cevap (Q&A)**: Dokümanlarınız hakkında soru sorup AI destekli cevaplar alabilirsiniz
- **Otomatik Özetleme**: Dokümanlar için kısa ve uzun özetler oluşturabilirsiniz
- **Dosya Bazlı Filtreleme**: Belirli bir doküman üzerinde arama ve soru-cevap yapabilirsiniz
- **Modern Web Arayüzü**: React ve Vite ile geliştirilmiş responsive kullanıcı arayüzü

## Teknolojiler

### Backend
- Node.js (v18+)
- Express.js
- SQLite (better-sqlite3) - FTS5 ile tam metin arama
- Google Gemini AI - Soru-cevap ve özetleme
- Multer - Dosya yükleme
- PDF-Parse - PDF metin çıkarma
- Jest - Test framework

### Frontend
- React 18
- Vite
- Modern CSS (Glassmorphism, Gradient, Animations)

## Gereksinimler

- Node.js v18 veya üzeri
- npm veya yarn
- Google Gemini API anahtarı

## Kurulum

### 1. Projeyi Klonlayın

```bash
git clone <repository-url>
cd smart-document-search-system
```

### 2. Backend Bağımlılıklarını Yükleyin

```bash
npm install
```

### 3. Frontend Bağımlılıklarını Yükleyin

```bash
cd client
npm install
cd ..
```

### 4. Ortam Değişkenlerini Ayarlayın

Proje kök dizininde `.env` dosyası oluşturun:

```env
GEMINI_API_KEY=your_api_key_here
PORT=3000
NODE_ENV=development
GEMINI_MODEL=gemini-1.5-flash
```

**Google Gemini API Anahtarı Nasıl Alınır:**
1. [Google AI Studio](https://makersuite.google.com/app/apikey) adresine gidin
2. Yeni bir API anahtarı oluşturun
3. `.env` dosyasına `GEMINI_API_KEY` olarak ekleyin

## Çalıştırma

### Geliştirme Modu

**Terminal 1 - Backend:**
```bash
npm run dev
```

Backend `http://localhost:3000` adresinde çalışacaktır.

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```

Frontend genellikle `http://localhost:5173` adresinde çalışacaktır.

### Üretim Modu

**Backend:**
```bash
npm start
```

**Frontend:**
```bash
cd client
npm run build
npm run preview
```

## API Endpoints

### Doküman İşlemleri

#### Doküman Yükleme
```
POST /api/docs/upload
Content-Type: multipart/form-data
Body: file (PDF veya TXT, max 10MB)
```

#### Doküman Listeleme
```
GET /api/docs?limit=20&offset=0
```

#### Doküman Detay
```
GET /api/docs/:id
```

#### Doküman İndirme
```
GET /api/docs/:id/download
```

#### Doküman Arama
```
GET /api/docs/search?q=arama_terimi&limit=20&offset=0&docId=opsiyonel_dokuman_id
```

#### Kısa Özet Oluşturma
```
POST /api/docs/:id/summary/short
```

#### Uzun Özet Oluşturma
```
POST /api/docs/:id/summary/long
Body: { "level": "medium|long", "format": "structured|bullets" }
```

### Soru-Cevap

#### Soru Sorma
```
POST /api/qa
Body: {
  "question": "Soru metni",
  "topK": 5,
  "docLimit": 5,
  "docId": "opsiyonel_dokuman_id"
}
```

### Health Check

```
GET /health
```

## Proje Yapısı

```
smart-document-search-system/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React bileşenleri
│   │   ├── api.js         # API yardımcı fonksiyonları
│   │   ├── App.jsx        # Ana uygulama
│   │   └── styles.css     # Global stiller
│   └── package.json
├── src/                    # Node.js backend
│   ├── controllers/       # Route controller'ları
│   ├── db/                 # Veritabanı yapılandırması
│   ├── middleware/         # Express middleware'leri
│   ├── repositories/       # Veritabanı repository katmanı
│   ├── routes/             # API route'ları
│   ├── services/           # İş mantığı servisleri
│   ├── utils/              # Yardımcı fonksiyonlar
│   ├── errors/             # Hata yönetimi
│   ├── app.js              # Express uygulama yapılandırması
│   └── server.js           # Server başlatma
├── test/                   # Test dosyaları
├── data/                   # SQLite veritabanı dosyaları
├── uploads/                # Yüklenen dosyalar
├── package.json
└── README.md
```

## Kullanım

### Doküman Yükleme

1. Web arayüzünde "Upload" kartına gidin
2. PDF veya TXT dosyası seçin (maksimum 10MB)
3. "Upload" butonuna tıklayın
4. Dosya otomatik olarak işlenir ve veritabanına kaydedilir

### Doküman Arama

1. "Search" panelinde arama terimi girin
2. İsterseniz belirli bir doküman seçin (dropdown'dan)
3. "Search" butonuna tıklayın
4. Sonuçlar listelenir

### Soru-Cevap

1. "Soru-Cevap (Q&A)" panelinde sorunuzu yazın
2. İsterseniz belirli bir doküman seçin
3. "Sor" butonuna tıklayın
4. AI destekli cevap ve kaynaklar görüntülenir

### Özet Oluşturma

1. Documents tablosunda bir dokümanın "Görüntüle" butonuna tıklayın
2. Açılan modalda "Kısa Özet" veya "Uzun Özet" butonuna tıklayın
3. Özet oluşturulur ve görüntülenir

## Test

Testleri çalıştırmak için:

```bash
npm test
```

Watch modu:

```bash
npm run test:watch
```

## Güvenlik

- Helmet.js ile HTTP header güvenliği
- CORS yapılandırması
- Dosya tipi validasyonu (sadece PDF ve TXT)
- Dosya boyutu limiti (10MB)
- Duplicate dosya kontrolü (SHA256 hash)
- XSS koruması (React'ın güvenli rendering'i)

## Veritabanı

SQLite veritabanı kullanılmaktadır. Veritabanı dosyası `data/app.db` konumunda oluşturulur.

FTS5 (Full-Text Search) tablosu otomatik olarak oluşturulur ve doküman içeriklerinde hızlı arama sağlar.

## Lisans

ISC

## Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'feat: amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## Notlar

- Dokümanlar `uploads/` klasöründe saklanır
- Veritabanı dosyaları `data/` klasöründe saklanır
- Geliştirme modunda nodemon otomatik yeniden başlatma yapar
- Frontend Vite ile hot-reload desteği sunar
