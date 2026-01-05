# Smart Document Search System

Node.js + Express backend proje iskeleti.

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. `.env` dosyasını oluşturun:
```bash
cp .env.example .env
```

## Geliştirme (Dev) Çalıştırma

```bash
npm run dev
```

Bu komut nodemon ile otomatik yeniden başlatma özelliğiyle çalışır.

## Üretim (Prod) Çalıştırma

```bash
npm start
```

## Health Check Endpoint

Server çalıştıktan sonra health endpoint'ini test edebilirsiniz:

### Windows (PowerShell):
```powershell
curl http://localhost:3000/health
```

### Mac/Linux:
```bash
curl http://localhost:3000/health
```

### Örnek Çıktı:
```json
{
  "status": "ok",
  "uptimeSec": 123.45,
  "env": "development"
}
```

## Proje Yapısı

```
src/
├── app.js              # Express uygulama yapılandırması
├── server.js           # Server başlatma
├── middleware/
│   ├── logger.js       # Request logger middleware
│   └── errorHandler.js # Global error handler
└── routes/
    ├── index.js        # Ana route dosyası
    └── health.js       # Health check route
```

## Teknolojiler

- Node.js (LTS)
- Express.js
- Helmet (Güvenlik)
- CORS
- dotenv (Environment variables)

