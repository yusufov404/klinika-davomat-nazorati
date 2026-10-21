# ISHLAB CHIQARISH REJASI (5 hafta)

| Hafta | Ish | Natija |
|---|---|---|
| 1 | Tarmoq, PoE switch, VLAN 50, statik IP, NTP, parollar. Ubuntu server, Docker, UPS. Terminalda push sinovi | Event serverga keladi |
| 2 | Migratsiyalar, auth+RBAC, employees/departments/terminals CRUD. `/api/hikvision/events`, duplicate himoyasi, raw_payload. Reconcile job | Loglar bazada saqlanadi |
| 3 | shifts/schedules/holidays/leaves. Hisoblash algoritmi (tungi smena). Terminalga xodim sinxronlash (user+face) va retry | To'liq tabel hisoblanadi |
| 4 | Admin panel: dashboard, xodimlar, grafik, ta'til, tabel, qo'lda tuzatish. Hisobotlar, Excel/PDF, audit log | Panel to'liq ishlaydi |
| 5 | Yuzlarni kiritish (rozilik bilan). 1 haftalik parallel sinov. Xatolarni tuzatish, o'qitish, topshirish | Ishga tushirish |

---

## 1-hafta: Tarmoq va qurilmalar

- [ ] Kabel yotqizish (Cat 6, har bir terminaldan switchgacha ≤ 90 m)
- [ ] Managed PoE switch: 8 port, 802.3af
- [ ] VLAN 50: 192.168.50.0/24 (terminallar + server)
- [ ] Statik IP: server 192.168.50.2, terminallar .11-.14
- [ ] NTP (chrony) — `Asia/Tashkent`
- [ ] Terminal default parolini almashtirish, gateway o'chirish
- [ ] Ubuntu Server 22.04 LTS + Docker + docker-compose
- [ ] UPS (600-1000 VA) ulash, BIOS "Restore on AC power"
- [ ] `sudo ./scripts/install-server.sh`
- [ ] `.env` kalitlari (JWT, ENCRYPTION_KEY, TERMINAL_EVENT_TOKEN)
- [ ] Terminalda HTTP Host Notification sinovi (test event)

## 2-hafta: Backend asosi

- [ ] `docker compose up -d --build`, migratsiyalar, seed
- [ ] Admin login va RBAC tekshiruvi (4 rol)
- [ ] Xodimlar/bo'limlar/lavozimlar/terminallar CRUD
- [ ] Terminal paroli AES-256-GCM bilan shifrlangan ekanini tekshirish
- [ ] Push event → log yozilishi, duplicate rad etilishi
- [ ] Reconcile job (pull) ishlashi

## 3-hafta: Biznes mantiq

- [ ] Smenalar (kunduzgi, tungi, 24 soatlik) va grafiklar
- [ ] Bayramlar, ta'til turlari, ta'til so'rovlari
- [ ] Hisoblash algoritmi: tungi smena, yil o'tishi, absent, leave
- [ ] Terminalga xodim sinxronlash (ISAPI) va retry logikasi
- [ ] Qo'lda tuzatish + audit

## 4-hafta: Admin panel va hisobotlar

- [ ] Boshqaruv paneli statistikalari
- [ ] Xodimlar, terminallar, grafik, ta'til, tabel sahifalari
- [ ] Hisobotlar: kechikkanlar, kelmaganlar, bo'limlar kesimi
- [ ] Excel (kunlik + oylik) va PDF eksport
- [ ] Audit log ko'rinishi
- [ ] Rollarga mosligi (hisobchi tahrirlay olmaydi)

## 5-hafta: Sinov va ishga tushirish

- [ ] Barcha xodimlardan biometrik rozilik (yozma)
- [ ] Yuzlarni kiritish, terminalga sinxronlashni tekshirish
- [ ] 1 haftalik parallel sinov (eski usul bilan solishtirish)
- [ ] Xatolarni tuzatish
- [ ] Foydalanuvchilarni o'qitish
- [ ] Backup tiklash mashqi
- [ ] Qabul ro'yxatini to'ldirish va topshirish

---

## Topshiriq hujjatlari

- `README.md` — o'rnatish va foydalanish
- `docs/ARXITEKTURA.md` — texnik arxitektura
- `docs/TERMINAL_SOZLASH.md` — terminal sozlash qadamlari
- `.env.example` — barcha sozlamalar tavsifi bilan
- `docs/QABUL_ROYXATI.md` — qabul ro'yxati

---

## Xavf omillari va zaxiralar

| Xavf | Zaxira |
|---|---|
| Terminal firmware push qo'llamaydi | Reconcile (pull) ishlaydi — majburiy emas |
| ISAPI yo'li o'zgargan | `HikvisionClient` da barcha endpoint'lar bitta klassda — o'zgartirish oson |
| Yuzni tanib olmaydi | Karta/PIN fallback + qo'lda tuzatish + rozilik |
| Server ishlamay qolsa | Terminal loglarni o'zida saqlaydi, reconcile to'ldiradi |
| Elektr uzilishi | UPS + BIOS "Restore on AC Power" |
| DB buzilishi | Kunlik `pg_dump` + haftalik tashqi nusxa + tiklash mashqi |
