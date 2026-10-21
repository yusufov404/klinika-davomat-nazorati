# Klinika Xodimlari Davomat Nazorati Tizimi

[![CI](https://github.com/yusufov404/klinika-davomat-nazorati/actions/workflows/ci.yml/badge.svg)](https://github.com/yusufov404/klinika-davomat-nazorati/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-20%2B-green.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgres-16-blue.svg)](https://www.postgresql.org)
[![License](https://img.shields.io/badge/license-proprietary-grey.svg)]()

Hikvision Face ID terminallarini markaziy bazaga ulab, davomatni avtomatik
hisoblaydigan lokal (LAN) tizim.

```
┌──────────────┐   HTTP push (ISAPI)   ┌─────────────┐   ┌──────────────┐
│ Hikvision DS │ ────────────────────► │  Backend    │──►│ PostgreSQL   │
│ Face Terminal│                       │ Node+Express │   │ (timestamptz)│
└──────────────┘   ISAPI pull (reconcile)└─────────────┘   └──────────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │  Admin panel     │
                                     │  (Tailwind+Alpine)│
                                     └──────────────────┘
```

> Tizim **faqat davomatni nazorat qiladi**. Maosh hisoblash tizim doirasiga
> kirmaydi — tabel ma'lumotlari hisobchiga hisobot sifatida beriladi.

---

## 1. Tarkibi

| Papka | Mazmuni |
|---|---|
| `server/` | Backend: Node.js + Express + Sequelize, PostgreSQL, job'lar, ISAPI klienti |
| `server/src/models` | 25 ta model (24 jadval) |
| `server/src/migrations` | Versiyalangan SQL migratsiyalari (4 ta) |
| `server/src/services` | Davomat hisoblash, ingest, sinxronlash, reconcile, Excel, bildirishnoma, sozlamalar, payroll, 2FA, xato kuzatuvi |
| `server/src/routes` | API marshrutlari (REST) + Swagger |
| `web/` | Admin panel (HTML5 + Tailwind CSS + Alpine.js + Chart.js, CDN'siz/offlayn) |
| `scripts/` | O'rnatish, sertifikat, backup/restore skriptlari |
| `docs/` | Texnik arxitektura va foydalanish qo'llanmasi |
| `.github/workflows/` | CI (lint + test + E2E + Docker build) |

---

## 2. Tez ishga tushirish (Docker, tavsiya etiladi)

### 2.1 Server tayyorlash (Ubuntu Server 22.04/24.04)

```bash
sudo ./scripts/install-server.sh
```

Skript Docker'ni o'rnatadi, loyihani `/opt/attendance` ga ko'chiradi,
`.env` faylini yaratadi, NTP (Asia/Tashkent) va firewall sozlamalarini
bajaradi.

### 2.2 `.env` faylini to'ldirish

```bash
cp .env.example .env
openssl rand -hex 48   # JWT_ACCESS_SECRET
openssl rand -hex 48   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (64 ta hex belgi)
```

**Muhim:** `ENCRYPTION_KEY` ni keyin o'zgartirmang — bazadagi terminal
parollari ochilmay qoladi.

### 2.3 Ishga tushirish

```bash
docker compose up -d --build
docker compose exec app node scripts/migrate.js up
docker compose exec app node scripts/seed.js
```

- Admin panel: `http://<server-IP>:8080`
- API hujjatlari (Swagger): `http://<server-IP>:3000/api/docs`
- API health: `http://<server-IP>:3000/api/health`
- Default login: `admin` / `Admin@12345` (**darhol o'zgartiring!**)

### 2.4 HTTPS (tavsiya etiladi)

```bash
./scripts/make-certs.sh 192.168.50.2
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d
```

Endi panel `https://192.168.50.2` orqali ishlaydi (lokal sertifikat).

---

## 3. Lokal ishlab chiqish (Docker'siz)

Windows/Mac/Linux'da, faqat Node.js 20+ kerak:

```bash
cd server
npm install
npm run dev:local        # http://127.0.0.1:3000
```

`dev:local` skripti **PGlite** (jarayon ichidagi Postgres) ishlatadi —
Docker'siz to'liq ishlaydigan muhit. Ma'lumotlar `server/.pgdata` da saqlanadi.

Demo ma'lumotlar (xodimlar, terminallar, haftalik davomat):

```bash
node scripts/demo-data.js
```

Login: `admin` / `Admin@12345`

### 3.1 Testlar va kod sifati

```bash
cd server
npm test              # 70+ ta test (real Postgres — PGlite orqali)
npm run test:e2e      # Playwright bilan brauzer testlari
npm run test:load     # k6 bilan yuk testi
npm run lint          # ESLint
npm run format        # Prettier (avtomatik formatlash)
npm run format:check  # tekshirish (CI uchun)
```

CI (GitHub Actions) `.github/workflows/ci.yml` da: lint → format → test →
E2E → Docker image build.

**Testlar nima tekshiradi:**
- davomat hisoblash algoritmi (tungi smena, 24 soatlik navbatchilik, yil o'tishi)
- event normalizatsiyasi va ISAPI Digest auth
- migratsiyalar (haqiqiy Postgres da, up/down)
- **modellarning barcha ustunlari bazada mavjudligi** (nom mosligi tekshiruvi)
- to'liq integratsiya oqimi: push event → log → hisob → tabel
- RBAC va rollar huquqlari, Excel round-trip, parol kuchliligi, audit zanjiri

---

## 4. Terminal bilan integratsiya

### 4.1 Push (asosiy usul)

Terminalda **HTTP Host Notification** sozlansin:

- URL: `http://192.168.50.2:3000/api/hikvision/events`
- Method: POST, Authentication: Digest
- Parametr: `token=<TERMINAL_EVENT_TOKEN>`

Tizim quyidagilarni qabul qiladi: `application/json`,
`multipart/form-data` (`packetInfo` maydoni JSON), `application/x-www-form-urlencoded`,
XML. Nested `AccessControllerEvent` maydonlari avtomatik ochiladi.

Qabul qilinadigan event: `major=5`, `minor=75` (yuz orqali tasdiqlash).
Karta/PIN eventlari `TERMINAL_ALLOW_CARD_EVENTS=true` bo'lsa ham olinadi.

**Xavfsizlik:** IP allowlist (`TERMINAL_IP_ALLOWLIST` yoki bazadagi terminal
IP'si) + maxfiy token. Terminal aniqlanmaganda event rad etiladi va loglanadi.

### 4.2 Pull (reconcile — zaxira usul)

Har 5 daqiqada oxirgi 2 soat, kechqurun esa 24 soatlik loglar
`POST /ISAPI/AccessControl/AcsEvent?format=json` orqali o'qiladi
(Digest auth, pagination qo'llab-quvvatlanadi). Server o'chib qolsa ham
loglar yo'qolmaydi.

### 4.3 Xodimlarni terminallarga sinxronlash

Admin panelda xodim qo'shilganda/o'zgarganda/ishdan ketganda avtomatik
ravishda barcha terminallarga yuboriladi:

- `POST /ISAPI/AccessControl/UserInfo/Record` (qo'shish)
- `PUT  /ISAPI/AccessControl/UserInfo/Modify` (o'zgartirish)
- `PUT  /ISAPI/AccessControl/UserInfo/Delete` (o'chirish)
- `POST /ISAPI/Intelligent/FDLib/FDUpdate` (yuz rasmi)

Navbat `terminal_sync_jobs` jadvalida saqlanadi, xatolar `2^n` daqiqa
oraliq bilan 5 marta qayta uriniladi.

---

## 5. Davomat hisoblash qoidalari

1. Xodimning shu kundagi smenasi `employee_schedules` + `holidays` +
   `leaves` dan aniqlanadi.
2. Loglar oyna chegarasiga (smena boshidan 3 soat oldin → oxiridan 3 soat
   keyin) biriktiriladi. Tungi smena loglari **smena boshlanadigan kunga**
   yoziladi.
3. `direction=in/out/both` ga qarab kirish/chiqish aniqlanadi; `both`
   bo'lsa oyna ichidagi birinchi log = kirish, oxirgi log = chiqish.
4. `late_minutes = max(0, kelish − (smena boshi + grace))`
   (`ATTENDANCE_LATE_COUNTS_FULL_GRACE` orqali to'liq/faqat oshgan qismi).
5. `early_leave_minutes = max(0, (smena oxiri − grace) − ketish)`.
6. `worked_minutes = ketish − kelish − tanaffus`.
7. Holatlar: `present`, `late`, `absent`, `leave`, `holiday`, `day_off`,
   `incomplete` (bitta log yoki smenaning bir qismi logsiz).
8. Qo'lda tuzatilgan kunlar (`is_manual_adjusted`) avtomatik qayta
   hisoblamada **ustidan yozilmaydi**.

---

## 6. Rollar (RBAC) va hisoblar

### 6.1 Standart hisoblar (seed orqali yaratiladi)

| Login | Rol | Parol (`.env` dan) | Vazifa |
|---|---|---|---|
| `admin` | `superadmin` | `ADMIN_PASSWORD` | Tizim administratori — to'liq huquq |
| `adminka` | `adminka` | `ADMINKA_PASSWORD` | Ikkinchi administrator — **admin bilan bir xil to'liq huquq** |
| `glavniy_vrach` | `glavniy_vrach` | `GLAVNIY_VRACH_PASSWORD` | Glavniy vrach — ko'rish + tasdiqlash |
| `kadr` | `hr_head` | `HR_PASSWORD` | Kadrlar bo'limi (ixtiyoriy — o'zingiz yaratishingiz mumkin) |
| xodim logini | `staff` | — | Klinika xodimi — **faqat o'z paneli** (`terminalUserId` = tabel raqami) |

> **Parollarni darhol o'zgartiring!** Standart parollar faqat ilk ishga tushirish uchun.

### 6.2 Rollar va huquqlar

| Rol | Huquqlar |
|---|---|
| `superadmin` | Hammasi: sozlamalar, terminallar, foydalanuvchilar, rollar |
| `adminka` | **Admin bilan bir xil** — hammasi |
| `glavniy_vrach` | Ko'rish + tasdiqlash: hisobotlar, tabel, xodimlar, ta'til va oylik tabelni tasdiqlash, audit. Tahrirlash yo'q. |
| `hr_head` | Xodimlar, terminallar, grafik, tabel, qo'lda tuzatish, ta'tillar, oylik tabel |
| `director` | Hisobotlar, ta'tilni tasdiqlash, oylik tabelni tasdiqlash (tahrirlash yo'q) |
| `accountant` | Tabel va hisobotlarni ko'rish/eksport (tahrirlash yo'q) |
| `staff` | **Faqat o'z paneli** — boshqa xodimlar ma'lumotini ko'ra olmaydi |

### 6.3 Huquqlarni paneldan boshqarish

**Sozlamalar → Rollar va huquqlar** — har bir rol uchun huquq matritsasi.
Belgilab **Saqlash** bosilsa, o'zgarish `role_permissions` jadvaliga yoziladi
va shu zahotiyoq kuchga ega bo'ladi (kirishda `req.user.permissions` yangilanadi).

- `Tiklash` — rolini dasturiy standartga qaytaradi.
- O'zgarish `audit_log` da `role.permissions.update` amali bilan qayd etiladi.
- Panel menyusi foydalanuvchining huquqlariga qarab avtomatik qisqaradi
  (masalan, glavniy vrach "Sozlamalar → Foydalanuvchilar"ni ko'rmaydi).

### 6.4 Texnik jihatlar

Parollar bcrypt (12 rounds) bilan saqlanadi. Access token 15 daqiqa,
refresh token 7 kun (rotatsiya bilan, DBda saqlanadi). 5 xato urinishdan
keyin 15 daqiqa bloklanadi.

---

## 7. API (qisqa)

```
POST   /api/auth/login | /refresh | /logout      GET  /api/auth/me
POST   /api/auth/password                       PUT  /api/auth/profile
GET    /api/auth/sessions                       DELETE /api/auth/sessions
CRUD   /api/employees  /api/departments /api/positions
CRUD   /api/terminals (+ /:id/test, /:id/notify, /:id/sync)
GET    /api/terminals/monitoring                ← monitoring paneli
CRUD   /api/shifts /api/schedules /api/holidays /api/leave-types
POST   /api/schedules/bulk                      ← ko'p xodimga grafik
CRUD   /api/leaves (+ /:id/approve, /:id/reject)
GET    /api/roles                           PUT /api/roles/:id/permissions
GET    /api/users (+ POST / PUT)
GET    /api/attendance/logs | /daily            POST /api/attendance/adjust
GET    /api/timesheets/:year/:month             POST /api/timesheets/:year/:month/generate
GET    /api/reports/summary|daily|late|absent|incomplete
GET    /api/reports/export/daily.xlsx | timesheet.xlsx | timesheet.pdf
GET    /api/attendance/tabel/:year/:month/template.xlsx   ← Excel shablon
POST   /api/attendance/import-excel                        ← Tabel Excel import
GET    /api/employees/template.xlsx            POST /api/employees/import-excel
GET    /api/notifications                       POST /api/notifications/read-all
GET    /api/settings  PUT /api/settings         POST /api/settings/telegram/test
GET    /api/errors    GET /api/errors/stats
GET    /api/docs      (Swagger UI)              GET /api/openapi.json
POST   /api/hikvision/events                    GET /api/health
GET    /api/metrics   (Prometheus)
```

Barcha javoblar bir xil formatda:
`{ "success": true, "data": ... }` yoki
`{ "success": false, "error": { "code", "message", "details" } }`.

---

## 8. HR ish oqimi

| Imkoniyat | Tushuntirish |
|---|---|
| **Oylik oqim** | `open → submitted → approved → locked`. Yopilgan davrga avtomatik qayta hisoblash **tegmaydi** — tasdiqlangan raqamlar o'zgarib ketmaydi. Qayta ochish faqat tasdiqlovchilar uchun. |
| **Ta'til balansi** | Har bir xodim va ta'til turi bo'yicha: berilgan / sarflangan / qolgan kunlar. Yil bo'yicha massaviy to'ldirish. |
| **Qo'shimcha ish vaqti** | Overtime: oddiy (1.0x), kechqurun (1.5x), bayram (2.0x), dam kuni (1.5x). Avtomatik kechqurun aniqlash. |
| **Tasdiqlash so'rovlari** | Xodim kelish/ketishni tasdiqlashga so'raydi → HR tasdiqlaydi → davomat avtomatik tuzatiladi (audit bilan). |
| **Biometrik rozilik registri** | Har bir xodim uchun imzolangan rozilik: hujjat №, berilgan sanasi, muddati, bekor qilish. |

## 9. Xodimning o'z paneli (self-service)

Xodim `admin`/`kadr` kabi tizim hisobiga kiringanda o'z panelini ko'radi:
o'z davomati, ish vaqti, kechikishlari, ta'til balansi, overtime'i va
kelishni tasdiqlashga so'rov yuborishi mumkin.

**Tashxis**: `terminalUserId` (login) = xodimning terminaldagi `employeeNo`si.

**Rol**: `staff` — hech qanday boshqa modul huquqi yo'q, faqat `/api/my/*`.
Kirganda panel avtomatik "Menim panel" sahifasiga yo'naltiriladi.

> Demo uchun `node scripts/demo-data.js` xodim `1001` uchun `staff` roli bilan
> hisob yaratadi (`1001` / `Xodim@12345`).

---

## 10. Xavfsizlik va huquqiy qat'iyat

| Xususiyat | Tushuntirish |
|---|---|
| **2FA (TOTP)** | Google Authenticator / Aegis. Kalit AES bilan shifrlangan, o'zi ham xavfsiz (`two_factor_secret`). |
| **Audit zanjiri** | Har bir audit yozuvi oldingisining hash'ini o'z ichiga oladi (`hash = sha256(prev_hash + row)`). O'zgartirilganlik **Sozlamalar → Xavfsizlik → Audit zanjiri** orqali aniqlanadi. |
| **API kalitlari** | Tashqi integratsiyalar uchun `X-API-Key` header. Kalit faqat hash ko'rinishida saqlanadi, bir marta ko'rsatiladi. |
| **Parol siyosati** | Kamida 8 belgi, katta/kichik harf, raqam, maxsus belgi. O'zgartirilganda barcha sessiyalar bekor qilinadi. |
| **Majburiy parol o'zgartirish** | `must_change_password` belgisi — birinchi kirishda parolni o'zgartirish talab qilinadi. |
| **Sessiyalar** | Faol sessiyalarni ko'rish va boshqalarini bekor qilish. |

---

## 11. Hisobotlar va eksport

| Nomi | Nima qiladi |
|---|---|
| **Hisobot konstruktori** | Ustunlarni va filtrlarni tanlang, shablonni saqlang, keyin bir zumda qo'llang. 15 ta tayyor ustun. |
| **Hisob-chek (payroll)** | Ish kunlari, soatlar, overtime, kechikish, absent, ta'til + **to'lov hisobi** (koeffitsiyent kiritiladi). 1C/Excel uchun matritsa formatida ham. |
| **Oylik tabel** | Excel + PDF, rasmiy brif bilan (chop etish uchun). |
| **Kunlik tabel** | Excel eksport (barcha filtrlar bilan). |
| **Taqsimot** | Chart.js: dinamika, bo'limlar kesimi, taqsimot. |

---

## 12. Ishonch va sifat

| Nima | Qayerda |
|---|---|
| **70+ test** (haqiqiy Postgres) | `npm test` |
| **13 ta E2E test** (Playwright) | `npm run test:e2e` |
| **Yuk testi** (k6, 50 event/s) | `npm run test:load` |
| **Metrikalar** (Prometheus) | `GET /api/metrics` |
| **CI** (lint → format → test → E2E → Docker) | `.github/workflows/ci.yml` |
| **Strukturali loglar** | request ID, foydalanuvchi, vaqt; `LOG_FORMAT=json` bilan agregator uchun |
| **Xato kuzatuvi** | 500 xatolar `error_logs` ga yoziladi → panel → Sozlamalar → Server xatolari |

**Metrikalar**: `http_requests_total`, `request_duration_seconds`,
`db_up`, `db_attendance_logs_total`, `db_employees_total`,
`process_resident_memory_bytes`, `process_uptime_seconds`.

---

## 13. UX

Dark mode (⚙ tugmasi) · **Ctrl+K** command palette · O'zbek/Rus tillar ·
PWA (telefonda o'rnatiladi, oflayn ishlaydi) · Jadval saralash · Skeleton
loaderlar · Bo'sh holatlar · Chop etish (A4 landscape) · Avtomatik menyu
(rolga qarab) · Bildirishnoma belgchasi

---

## 14. Excel integratsiyasi (tabel uchun)

Tizim Excel'ni to'liq qo'llaydi — **shablon yuklash** va **import qilish**
orqali HR tabelni Excel'da tahrirlaydi va tizimga qaytaradi.

### 14.1 Shablon yuklash

Admin panel → **Tabel** → **Shablon yuklash**
(yoki API: `GET /api/attendance/tabel/:year/:month/template.xlsx`).

Faylda 2 ta varaq bo'ladi:

- **Tabel** — matritsa: qator = xodim, ustun = oyning kunlari.
  Har bir kun katagida **dropdown** (I / K / T / B / D / X) va holatga
  qarab rang beriladi. So'nggi ustunlar: ish soati, kechikish, kelgan kun, izoh.
- **Qo'llanma** — kodlar, izohlar, smenalar va bayramlar ro'yxati.

| Kod | Holat | Tizimdagi ma'nosi |
|---|---|---|
| `I` | Ishta | `present` |
| `K` | Kechikdi | `late` |
| `T` | Ta'til | `leave` |
| `B` | Bayram | `holiday` |
| `D` | Dam kuni | `day_off` |
| `X` | Kelmagan | `absent` |

### 14.2 Import qilish

**Tabel** → **Excel import** → faylni tanlang. Natija modal oynasida:
qo'llandi / o'zgarmagan / o'tkazildi / xato sonlari va o'zgarishlar ro'yxati.

Qoidalar:
- faqat **o'zgartirilgan** kataklar bazaga yoziladi (o'zgarmagan qatorlar
  tegilmaydi, kelish/ketish vaqtlari buzilmaydi);
- import qilingan kun `is_manual_adjusted=true` bo'ladi → avtomatik qayta
  hisoblamada saqlanib qoladi;
- har bir o'zgarish `manual_adjustments` + `audit_log` da qayd etiladi;
- noma'lum xodim yoki noto'g'ri kod → xato ro'yxatida ko'rsatiladi;
- import natijasi: `{ applied, unchanged, skipped, errors[], details[] }`.

### 14.3 Xodimlarni Excel'dan import

**Xodimlar** → **Excel shablon** (bo'sh shablon yuklanadi) →
`Xodim | Tabel № | Bo'lim | Lavozim | Telefon | Ishga olish sanasi | Terminal ID`
ustunlarini to'ldirib → **Excel import**.

- `Bo'lim` va `Lavozim` nomlari bo'yicha **avtomatik yaratiladi**;
- `Tabel №` takrorlanmasa — xodim yangilanadi, aks holda yaratiladi;
- har bir xodim yaratilgach **avtomatik terminallarga yuboriladi**.

### 14.4 Ikkinchi format: kunlik tabel

Tizim kunlik eksportini ham qabul qiladi
(`Sana | Xodim | Tabel № | Kelish | Ketish | Ish vaqti (soat) | Kechikish | Holat`).
Bu formatda kelish/ketish vaqtlari va soatlar ham import qilinadi.

---

## 15. Bildirishnomalar (Telegram + ichki)

**Sozlamalar → Bildirishnoma va tizim sozlamalari**:

| Sozlama | Vazifa |
|---|---|
| `telegram.enabled` | Telegram bot orqali yuborish |
| `telegram.botToken` | BotFather dan olingan token |
| `telegram.chatId` | Xabar yuboriladigan chat ID |
| `notify.dailySummary` | Har kuni kunlik hisobot (soat 18:30) |
| `notify.terminalOffline` | Terminal offline bo'lgan xabar |
| `notify.leaveRequest` | Yangi ta'til so'rovi xabari |
| `notify.absentThreshold` | Kelmaganlar chegarasi (ogohlantirish uchun) |

**Telegram test** tugmasi — sozlama to'g'rimi tekshiradi.

Ichki bildirishnomalar (panel belgchasi): ta'til so'rovi, terminal
offline/online, kunlik hisobot.

---

## 16. Job'lar (node-cron)

| Job | Vaqti | Vazifasi |
|---|---|---|
| `reconcile` | har 5 daqiqa | Terminaldan loglarni o'qish, davomatni qayta hisoblash |
| `nightly-reconcile` | 02:00 | 24 soatlik to'liq tekshiruv |
| `calculate` | har 10 daqiqa | So'nggi 2 kunni qayta hisoblash |
| `terminal-sync` | har 2 daqiqa | Terminal sinxronlash navbatini bajarish |
| `terminal-health` | har daqiqa | Terminal holati, vaqt farqini tekshirish |
| `daily-summary` | 18:30 | Kunlik hisobot (panel + Telegram) |
| `error-cleanup` | har yakshanba 04:00 | 30 kundan eski xatolarni tozalash |
| `backup` | 03:00 har kuni | `pg_dump` → 4TB disk (14 kunlik rotatsiya) |

---

## 17. Xavfsizlik va maxfiylik

- Admin panel faqat LAN ichida, HTTPS bilan tavsiya qilinadi.
- Terminal parollari bazada AES-256-GCM bilan shifrlangan (kalit `.env` da).
- PostgreSQL porti Docker'da tashqariga ochilmaydi.
- Barcha qo'lda o'zgarishlar `audit_log` da (kim, nima, qachon, IP, eski/yangi qiymat).
- **Biometrik ma'lumot:** yuz shablonlari shaxsiy ma'lumot. Xodimlardan yozma
  rozilik oling (tizimda **Roziliklar** bo'limi bor), O'zbekiston shaxsiy ma'lumotlar
  to'g'risidagi qonunchilikka rioya qiling, ishdan ketgan xodimning yuzini
  terminaldan va bazadan o'chiring.
- Loglarni saqlash muddati (masalan 3-5 yil) va arxivlashni belgilang.

---

## 18. Qabul qilish ro'yxati

- [ ] Terminallar statik IP'da, NTP va timezone to'g'ri (`Asia/Tashkent`)
- [ ] Default parollar almashtirilgan, internetga yopilgan
- [ ] Push eventlar serverga keladi, duplicate bazaga tushmaydi
- [ ] Server o'chirilganda reconcile loglarni to'ldiradi
- [ ] Tungi smena va 24 soatlik navbatchilik to'g'ri hisoblanadi
- [ ] Ta'til/bayram kunlari absent hisoblanmaydi
- [ ] Yangi xodim terminalga avtomatik qo'shiladi, ketgani o'chiriladi
- [ ] Rollar to'g'ri ishlaydi (hisobchi tahrirlay olmaydi)
- [ ] Qo'lda tuzatish `audit_log` ga yoziladi
- [ ] Oylik davr yopilishi va qayta hisoblanmasligi tekshirilgan
- [ ] Ta'til balansi to'g'ri hisoblanadi
- [ ] Audit zanjiri butun (`Xavfsizlik → Audit zanjiri`)
- [ ] Backup ishlaydi, qayta tiklash sinab ko'rilgan
- [ ] UPS ulangan, elektr o'chganda server toza o'chadi
- [ ] Xodimlardan biometrik rozilik olingan (Roziliklar bo'limida qayd etilgan)

---

## 19. Ko'p uchraydigan muammolar

| Muammo | Yechim |
|---|---|
| Terminal event yubormayapti | `POST /api/terminals/:id/test` bilan tekshirish; terminal vaqti serverdan 60s farq qilmasligi kerak |
| "Terminal topilmadi" xabari | Terminal IP'si bazadagi IP bilan mos kelmaydi yoki `TERMINAL_IP_ALLOWLIST` ga qo'shilmagan |
| "Token noto'g'ri" | Terminaldagi token `TERMINAL_EVENT_TOKEN` bilan bir xil bo'lishi kerak |
| Yuz tanish natijasi `incomplete` | Faqat bitta log kelgan — qo'lda tuzatish yoki terminal yo'nalishini `in`/`out` ga o'zgartiring |
| Excel import "Fayl formati tanib olinmadi" | "Shablon yuklash" orqali olingan fayldan foydalaning (yoki kunlik eksport formatida) |
| Excel import "Xodim topilmadi" | "Tabel №" ustuni xodimning tabel raqamiga teng bo'lishi kerak (yoki "Xodim" nomi aniq) |
| Import qilingan kun qayta hisoblanganda o'zgarmaydi | Bu normal — import qilingan kun "qo'lda tuzatilgan" deb saqlanadi |
| Audit zanjiri "buzilgan" ko'rsatadi | `audit_log` jadvalidagi yozuvlar tashqaridan o'zgartirilgan — huquqiy tekshiruv uchun signal |
| Vaqt noto'g'ri ko'rsatiladi | NTP sozlang; terminal va server vaqti 60s dan farq qilmasligi kerak |

---

## 20. Hujjatlar

- `docs/ARXITEKTURA.md` — to'liq texnik arxitektura va hisoblash algoritmi
- `docs/TERMINAL_SOZLASH.md` — Hikvision terminalini sozlash qadamlari
- `docs/ISHLAB_CHIQARISH_REJASI.md` — 5 haftalik jadval va topshiriq hujjatlari
- `docs/QABUL_ROYXATI.md` — qabul ro'yxati
