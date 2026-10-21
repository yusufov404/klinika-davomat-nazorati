# TEXNIK ARXITEKTURA

## 1. Umumiy tuzilma

Tizim 4 qismdan iborat:

1. **Fizik qism** — Hikvision Face ID terminallar, PoE switch, alohida VLAN.
2. **Backend** — Node.js (Express) + Sequelize, Docker ichida.
3. **Ma'lumotlar bazasi** — PostgreSQL 16 (`timestamptz` bilan).
4. **Admin panel** — brauzer orqali (HTML5 + Tailwind CSS + Alpine.js, oflayn).

### Ishlash oqimi

```
Xodim terminalga yuzini ko'rsatadi
        │
        ▼
Terminal event hosil qiladi
        │
        ├─(asosiy)──► HTTP POST /api/hikvision/events
        │                 ├─ IP allowlist + token tekshiruvi
        │                 ├─ normalizatsiya (AccessControllerEvent)
        │                 ├─ terminal va xodimni aniqlash
        │                 ├─ duplicate / debounce tekshiruvi
        │                 ├─ attendance_logs ga yozish
        │                 └─ darhol 200 OK (hisob navbatda)
        │
        └─(zaxira)────► reconcile job: POST /ISAPI/AccessControl/AcsEvent
                          (server o'chib qolgan/tarmoq uzilgan holat)
        │
        ▼
Davomat hisoblash algoritmi → daily_attendance
        │
        ▼
Admin panel: tabel, hisobotlar, Excel/PDF eksport
```

---

## 2. Texnologiyalar

| Qatlam | Texnologiya |
|---|---|
| Backend | Node.js 20+, Express 4, Sequelize 6, Zod (validatsiya) |
| Ma'lumotlar bazasi | PostgreSQL 16 (`timestamptz`, `Asia/Tashkent`) |
| Migratsiyalar | Sequelize CLI + umzug, `sequelize_migrations` jadvali |
| Autentifikatsiya | JWT (access 15m + refresh 7d, rotatsiya), bcrypt (12 rounds) |
| Shifrlash | AES-256-GCM (terminal parollari), kalit `.env` da |
| Frontend | HTML5 + Tailwind CSS 3 (kompilyatsiya qilingan) + Alpine.js 3 (vendored) |
| Job'lar | node-cron (reconcile, hisoblash, sinxronlash, health) |
| Eksport | exceljs (xlsx), pdfkit (pdf) |
| Deploy | Docker + docker-compose (db, app, web/nginx, backup) |

**ISUP / ISHK SDK yo'q** — faqat ISAPI (HTTP + Digest auth).

---

## 3. Tarmoq va xavfsizlik

```
Router/Switch
  ├── VLAN 50:192.168.50.0/24  (terminallar + server)
  │     ├── 192.168.50.2   Server (Docker host)
  │     ├── 192.168.50.11  Terminal 1 (kirish)
  │     ├── 192.168.50.12  Terminal 2 (chiqish / tungi)
  │     ├── 192.168.50.13  Terminal 3
  │     └── 192.168.50.14  Terminal 4
  └── VLAN 20:192.168.20.0/24 (admin ish stollari, Wi-Fi)
```

Firewall qoidalari:

| Manba | Nishon | Port | Izoh |
|---|---|---|---|
| VLAN 50 | Server | 3000/tcp | Terminal push eventlari |
| VLAN 20 | Server | 443/tcp | Admin panel (HTTPS) |
| VLAN 50 | Terminal | 80/tcp | Server → terminal (reconcile, sinxronlash) |
| Har qanday | Terminal | 80/443 | **TAQIQLANGAN** (internet yo'q) |

Terminal sozlamalari:
- default admin parolini almashtiring (har bir terminalga alohida);
- default gateway berilmasin yoki firewall bilan bloklanadi;
- Hik-Connect / bulut xizmatlari o'chiriladi;
- NTP: `ntp.pool.uz` yoki `time.uz`, timezone `Asia/Tashkent`.

---

## 4. Terminal integratsiyasi

### 4.1 Push endpoint

`POST /api/hikvision/events`

- Middleware: rate limit → multer (multipart) → token → IP allowlist
- Qabul formatlari: JSON, `multipart/form-data` (`packetInfo`), urlencoded, XML
- Qabul qilinadigan eventlar: `major=5`, `minor=75` (yuz), ixtiyoriy `minor=73` (karta)
- Javob: `200 OK` (og'ir hisob `setImmediate` bilan orqada bajariladi)
- Himoya: `X-Terminal-Token` header, `?token=` query yoki `packetInfo.token`
- Terminal identifikatsiyasi: `terminalSerialNo` → bazadagi `serial_number`,
  aks holda manba IP bo'yicha

### 4.2 Reconcile (pull)

```
POST /ISAPI/AccessControl/AcsEvent?format=json   (Digest auth)
{
  "AcsEventCond": {
    "searchID": "reconcile-<terminal>-<ts>",
    "searchResultPosition": 0,
    "maxResults": 30,
    "major": 5, "minor": 75,
    "startTime": "2026-01-01T00:00:00+05:00",
    "endTime":   "2026-01-01T23:59:59+05:00"
  }
}
```

Pagination `searchResultPosition` bilan davom etadi. Natijalar `source='pull'`
bilan yoziladi va duplicate tekshiruvidan o'tadi.

### 4.3 Xodim sinxronlash

| Amal | ISAPI |
|---|---|
| Qo'shish | `POST /ISAPI/AccessControl/UserInfo/Record?format=json` |
| O'zgartirish | `PUT /ISAPI/AccessControl/UserInfo/Modify?format=json` |
| O'chirish | `PUT /ISAPI/AccessControl/UserInfo/Delete?format=json` |
| Yuz qo'shish | `POST /ISAPI/Intelligent/FDLib/FDUpdate?format=json` (multipart) |

Har bir amal `terminal_sync_jobs` da qayd etiladi; xatolar
`2^attempts` daqiqa oralig'ida, ko'pi bilan 5 marta qayta uriniladi.

### 4.4 Duplicate himoyasi

1. `attendance_logs` da `UNIQUE (terminal_id, serial_no)`.
2. `serial_no` bo'lmasa — `(terminal_id, employee_id, log_time)` tekshiriladi.
3. Debounce: bir xodimning 60 soniya ichidagi eventlari bitta hisoblanadi
   (`ATTENDANCE_DEBOUNCE_SECONDS`).
4. `unmatched_events` — xodimi topilmagan eventlar (HR qo'lda bog'laydi).

### 4.5 Vaqt sinxronizatsiyasi

- Server va barcha terminallar NTP bilan `Asia/Tashkent`.
- Bazada barcha vaqt `timestamptz`; ilovada kun chegaralari TZ bo'yicha.
- Terminal va server vaqti 60 s dan farq qilsa, panelda ogohlantirish.

---

## 5. Ma'lumotlar bazasi sxemasi

```
roles ──< users ──< refresh_tokens
                 ├──< login_attempts
                 ├──< manual_adjustments
                 └──< audit_log

departments ──< employees >── positions
                     │
                     ├──< employee_schedules >── shifts
                     ├──< attendance_logs >──── terminals ──< terminal_sync_jobs
                     ├──< unmatched_events
                     ├──< leaves >─────────────── leave_types
                     ├──< daily_attendance >──── shifts
                     └──< timesheets

holidays (mustaqil jadval)
```

Asosiy jadvallar:

| Jadval | Noyob | Muhim ustunlar |
|---|---|---|
| `roles` | Rollar | `name` (unique) |
| `role_permissions` | Rol huquqlarining bazadagi sozlamalari | `role_id`, `permission`, `enabled` |
| `users` | Tizim foydalanuvchilari | `username` (unique), `password_hash`, `role_id` |
| `employees` | Xodimlar | `employee_no` (unique), `terminal_user_id` (unique), `department_id`, `position_id` |
| `terminals` | Terminallar | `ip_address` (unique), `password_encrypted`, `direction`, `serial_number` |
| `terminal_sync_jobs` | Sinxronlash navbati | `action`, `status`, `attempts`, `next_retry_at` |
| `attendance_logs` | Xom loglar | `UNIQUE(terminal_id, serial_no)`, `raw_payload` (jsonb) |
| `unmatched_events` | Xodimsiz eventlar | `resolved` |
| `shifts` | Smenalar | `start_time`, `end_time`, `crosses_midnight`, `grace_*`, `break_minutes` |
| `employee_schedules` | Grafik | `valid_from/to`, `weekdays` (jsonb), `priority` |
| `holidays` | Bayramlar | `date` (unique), `is_working` |
| `leave_types` / `leaves` | Ta'tillar | `status`, `approved_by` |
| `daily_attendance` | Kunlik natija | `UNIQUE(employee_id, date)`, `status`, `is_manual_adjusted` |
| `timesheets` | Oylik tabel | `UNIQUE(employee_id, year, month)`, `status` |
| `manual_adjustments` | Qo'lda tuzatish | `old_value`, `new_value`, `reason` (majburiy) |
| `audit_log` | Audit | `action`, `entity`, `before/after` (jsonb), `ip_address` |

Qo'shimcha jadvallar (spec'da yo'q, lekin kerak):
`refresh_tokens` (refresh token bekor qilish), `login_attempts` (bloklash),
`unmatched_events` (xodimsiz eventlar).

---

## 6. Hisoblash algoritmi

```
calculateEmployeeDay(employeeId, date)
 │
 ├─ 1) smena = employee_schedules(valid_from≤date≤valid_to, weekday mos)
 ├─ 2) ta'til (approved) → status = leave
 ├─ 3) bayram (is_working=false) → status = holiday
 ├─ 4) smena yo'q → status = day_off
 ├─ 5) oyna = [smena.boshi − 3h, smena.oxiri + 3h]
 │     tungi smena: loglar smena BOSHLANADIGAN kunga yoziladi
 ├─ 6) loglarni oynaga taqsimlash (bir nechta oyna → eng yaqin smenaga)
 ├─ 7) kirish = min(kirish loglari), chiqish = max(chiqish loglari)
 ├─ 8) late = max(0, kelish − (boshi + grace))
 │     early_leave = max(0, (oxiri − grace) − ketish)
 │     worked = ketish − kelish − tanaffus
 ├─ 9) status:
 │     log yo'q            → absent
 │     bitta log / qisman  → incomplete
 │     late > 0            → late
 │     aks holda           → present
 └─10) is_manual_adjusted=true bo'lsa — ustidan yozilmaydi
```

Holatlar: `present | late | absent | leave | holiday | day_off | incomplete`

---

## 7. Excel integratsiyasi

```
Tabel sahifasi                      Excel fayl                        Tizim
    │                                    │                               │
    ├─ "Shablon yuklash" ───────────────►│  Tabel (matritsa)             │
    │    GET /api/attendance/tabel/      │  Qo'llanma                    │
    │        :year/:month/template.xlsx  │                               │
    │                                    │                               │
    │                        HR tahrirlar│ (I/K/T/B/D/X + dropdown)      │
    │                                    ▼                               │
    ├─ "Excel import" ─────────────────►│  POST /api/attendance/        │
    │    (multipart/form-data)          │      import-excel             │
    │                                    │                               │
    │                                    │  parse → validate → apply     │
    │                                    │      ↓                        │
    │                                    │  daily_attendance (manual)    │
    │                                    │  manual_adjustments + audit  │
```

### 8.1 Matritsa formati

| Element | Tushuntirish |
|---|---|
| Sarlavha qatori | 3-qator: `№ | Xodim | Tabel № | Bo'lim | 1..31 | Ish soati | Kechikish | Kelgan kun | Izoh` |
| Kun kataklari | Kod: `I` ishta, `K` kechikdi, `T` ta'til, `B` bayram, `D` dam kuni, `X` kelmagan |
| Dropdown | Excel data validation (`I,K,T,B,D,X`) — noto'g'ri qiymatda ogohlantirish |
| Ranglar | holatga qarab katak rangi (ishda yashil, kechikdi sariq, kelmagan qizil) |
| Izoh ustuni | qator uchun tuzatish sababi (audit logga shu yoziladi) |

### 8.2 Import qoidalari

1. Faqat **o'zgartirilgan** kataklar yoziladi — o'zgarmagan qatorlar tegilmaydi.
2. `mode='status'` (matritsa): kelish/ketish vaqtlari va kechikish **saqlanadi**;
   faqat holat o'zgaradi. Ishga kelmagan holat (`X/T/B/D`) vaqtlarni tozalaydi.
3. `mode='full'` (kunlik format): vaqtlar, soatlar, kechikish fayldan olinadi.
4. Natijada `is_manual_adjusted = true` — avtomatik qayta hisoblamada ustidan
   yozilmaydi.
5. Har bir o'zgarish `manual_adjustments` (eski/yangi qiymat + sabab) va
   `audit_log` ga yoziladi.
6. Xodim `Tabel №` (yoki "Xodim" nomi) bo'yicha topiladi; topilmasa — xato.

### 8.3 Fayl formatlarini aniqlash

| Format | Belgilar |
|---|---|
| Matritsa | `Xodim` + `Tabel №` sarlavhalari va 1..31 raqamli ustunlar, yoki "Tabel" varaq nomi |
| Kunlik | `Sana` + `Xodim` sarlavhalari |

Aks holda 400 qaytariladi: "Fayl formati tanib olinmadi".

---

## 8. Xavfsizlik

| Yo'nalish | choralar |
|---|---|
| Panel | HTTPS (lokal CA), rate limit, session timeout, RBAC |
| Parollar | bcrypt (12 rounds), hech qachon logda ko'rsatilmaydi |
| Tokenlar | access 15m, refresh 7d + rotatsiya + DBda bekor qilish |
| Terminal parollari | AES-256-GCM, kalit `.env` da |
| Terminal eventlari | IP allowlist + maxfiy token |
| Audit | har bir o'zgartirish `audit_log` da |
| DB | Docker ichida, port tashqariga ochiq emas |
| OS | SSH faqat kalit bilan, avtomatik yangilanish, firewall |

### Biometrik ma'lumot

Yuz shabloni = maxfiy shaxsiy ma'lumot.

- Xodimlardan **yozma rozilik** oling (formular shabloni `docs/` da).
- O'zbekiston "Shaxsiy ma'lumotlar to'g'risida"gi qonuni va "Klinikada
  xodimlarni ishga olish va mehnat sharoitlarini yaratish" to'g'risidagi
  hujjatlar bilan tanishing.
- Yuz rasmlarini faqat terminalda saqlang; serverda shifrlangan holda
  kerak bo'lsa saqlang.
- Ishdan ketgan xodim: terminaldan darhol o'chirish + serverdan o'chirish.
- Loglarni saqlash muddatini (3-5 yil) va arxivlash tartibini belgilang.

---

## 9. Backup va ishonchlililik

- `pg_dump` (custom format) har kuni 03:00 da → 4 TB HDD, 14 kunlik rotatsiya.
- Haftalik nusxa alohida qurilmaga (tashqi disk / boshqa klinikada).
- Oylik "qayta tiklash" mashqi (restore.sh).
- UPS (600-1000 VA) + BIOS "Restore on AC Power".
- Docker konteynerlar `restart: unless-stopped`.
- `/api/health` monitoring: DB holati, terminallar online/offline, vaqt farqi.

---

## 10. Resurs talablari

| Komponent | Minimal | Tavsiya |
|---|---|---|
| CPU | 2 yadros | 4 yadros |
| RAM | 8 GB | 16 GB |
| Disk | 256 GB SSD (OS+DB) | 256 GB SSD + 4 TB HDD (backup) |
| Tarmoq | 1000 Mbps, 1 VLAN | managed PoE switch (8 port) |
| UPS | 600 VA | 1000 VA |

Taxminiy log o'sishi: 100 xodim × 2 log/kun ≈ 60 000 yozuv/yil ≈ 20 MB/yil
(oddiy `attendance_logs` jadvali; `raw_payload` bilan ~200 MB/yil).
