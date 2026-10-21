# QABUL QILISH RO'YXATI (ishga tushirishdan oldin)

## Tarmoq va terminallar

- [ ] Barcha terminallar statik IP'da, NTP yoqilgan, timezone `Asia/Tashkent`
- [ ] Terminal default parollari almashtirilgan, internetga yopilgan
- [ ] Terminalda gateway yo'q yoki firewall bilan faqat serverga ruxsat bor
- [ ] Terminal joylashuvi 1.4-1.6 m, to'g'ri quyosh nuri tushmaydi
- [ ] Kamera/PIN fallback yoqilgan

## Tizim

- [ ] Push eventlar serverga keladi, duplicate bazaga tushmaydi
- [ ] Server o'chirib yoqilganda reconcile loglarni to'ldiradi
- [ ] Tungi smena va 24 soatlik navbatchilik to'g'ri hisoblanadi
- [ ] Ta'til va bayram kunlari absent hisoblanmaydi
- [ ] Yangi xodim terminalga avtomatik qo'shiladi, ketgani o'chiriladi
- [ ] Rollar to'g'ri ishlaydi (hisobchi tahrirlay olmaydi)
- [ ] Qo'lda tuzatish `audit_log` ga yoziladi
- [ ] Terminal va server vaqti 60 s dan kam farq qiladi

## Xavfsizlik

- [ ] `.env` dagi barcha kalitlar almashtirilgan (JWT, ENCRYPTION_KEY, token)
- [ ] Admin paroli o'zgartirilgan
- [ ] Panel HTTPS orqali ishlaydi (lokal sertifikat)
- [ ] PostgreSQL porti tashqariga ochiq emas
- [ ] Terminal eventlari IP allowlist + token bilan himoyalangan

## Backup va ishonchlililik

- [ ] Backup ishlaydi va qayta tiklash sinab ko'rilgan
- [ ] UPS ulangan, elektr o'chganda server toza o'chadi/yoqiladi
- [ ] Haftalik backup boshqa qurilmaga nusxalanadi
- [ ] Docker konteynerlar `restart: unless-stopped`

## Biometrik ma'lumot

- [ ] Xodimlardan yozma rozilik olingan
- [ ] Rozilik hujjatlari saqlanadi
- [ ] Ishdan ketgan xodim yuzlari terminaldan va bazadan o'chirilgan
- [ ] Loglarni saqlash muddati belgilangan

## Qabul natijasi

| Mezon | Natija |
|---|---|
| 1 hafta parallel sinovda eski usul bilan moslik | ☐ |
| Tizim o'z-o'zidan ishlaydi (server o'chsa ham) | ☐ |
| Kadrlar foydalanuvchilar o'qitildi | ☐ |
| Hujjatlar (README, arxitektura) topshirildi | ☐ |

**Qabul qiluvchi:** ________________  **Sana:** ____________
