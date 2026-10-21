# HIKVISION TERMINALINI SOZLASH

Terminallar soni va modeli aniqlanmagan bo'lgani uchun quyidagi qadamlar
**ko'p modelli** yozilgan (DS-K1Txxx, DS-K1Axxx, DS-2CD3Txx, DS-K1T6xx va
h.k.). Aniq nomi bo'yicha **Terminal → Tarmoq → Platforma sozlamalari** qismini
ko'ring.

---

## 1. Tarmoq (Network)

| Parametr | Qiymat |
|---|---|
| IP Address | `192.168.50.11` (statik, har terminalga alohida) |
| Subnet Mask | `255.255.255.0` |
| Gateway | **Bo'sh qoldiring** (internetga chiqish kerak emas) |
| DNS | `192.168.50.2` (server) yoki bo'sh |
| VLAN | 50 (agar switch VLAN qo'llab-quvvatlasa) |
| PoE | 802.3af (kamida 15W) |

> Gateway bo'sh bo'lsa terminal tashqariga chiqmaydi. Agar router
> majburiy bo'lsa, firewall'da faqat server IP'siga (192.168.50.2:80)
> ruxsat bering va boshqa hammasini bloklang.

## 2. Vaqt (System → Time)

- Time Zone: **GMT+08:00 → (UTC+05:00) Asia/Tashkent** (menyuda "Tashkent")
- NTP: `ntp.pool.uz` yoki `time.uz`, port 123
- Enable NTP: **Yes**

Terminal va server vaqti 60 soniyadan farq qilmasligi kerak (panelda
ogohlantirish chiqadi).

## 3. Xavfsizlik (Security)

- **Change default admin password** — kuchli, har bir terminalga alohida.
- Kamera oqimini (stream) faqat server VLAN'ida ko'rsatish; internet
  publish'ni o'chiring (Hik-Connect / "Platform Access" → Disable).
- `SSH` / `Telnet` — o'chirilgan holatda qoldiring (ISAPI HTTP yetarli).
- "Upload to platform / Cloud" — o'chiriladi.

## 4. HTTP Host Notification (Push) — asosiy usul

`Event → Subscriptions → HTTP Host Notification` (yoki
`Network → Advanced Settings → HTTP Host Notification`):

| Parametr | Qiymat |
|---|---|
| Host Name / URL | `http://192.168.50.2:3000/api/hikvision/events?token=<TERMINAL_EVENT_TOKEN>` |
| Protocol | HTTP |
| Method | POST |
| Authentication | Digest (yoki None — token bilan himoyalanadi) |
| Content-Type | `application/json` (multipart ham qabul qilinadi) |
| Parameters | `token=<TERMINAL_EVENT_TOKEN>` |
| Timeout | 10 s |
| Retry Times | 3, interval 5 s |
| Heartbeat | ixtiyoriy |

**Sinov:** Panelda `Terminallar` → terminal kartasi → **Test** tugmasi.
Keyin terminal oldida turib yuzni ko'rsating; "Oxirgi ko'rinish" va
`Oxiqgi davomat loglari` jadvalida yozuv paydo bo'lishi kerak.

## 5. ISAPI sozlamalari (zaxira va sinxronlash uchun)

- `Enable User Authentication` / `Digest` — **yoqilgan** bo'lishi kerak
  (auth.service da Digest hisoblanadi).
- `Access Control` → `Face` → similarity (o'xshashlik) 80% (yoki 85%).
- `Live View` → `Protocol` → `HTTP` (RTSP kerak emas).
- `Time Sync` / `NTP` — yoqilgan.

## 6. Xodimlarni terminalga qo'shish

Ikkita yo'l bor:

1. **Tizim orqali (avtomatik, tavsiya etiladi):** Admin panel → Xodimlar →
   xodimni qo'shing → panel avtomatik barcha terminallarga yuboradi
   (ISAPI `UserInfo/Record`). Natijani `Terminallar` sahifasidagi
   "Sinxronlash vazifalari" orqali kuzatish mumkin.
2. **Qo'lda:** Terminal → Access Control → Person → Add → foydalanuvchi ID si
   **xodimning tabel raqamiga teng** bo'lishi shart (masalan `1001`).
   `employeeNo` va `terminalUserId` shu qiymatga mos kelishi kerak.

## 7. Yuz rasmini kiritish

- Rasm terminalga yoki serverdagi xodim kartasidan
  (`Xodimlar → yuz yuklash` tugmasi) yuboriladi.
- Rasm talablari: frontal yuz, yaxshi yoritilgan, 300x300 px dan katta,
  fon tekis, niqob/soyaga yo'q.
- 2-3 burchakdan (yon, yengil egilgan) surat yaxshi natija beradi.

## 8. Joylashuv

- Terminal balandligi: 1.4-1.6 m (yuz markazi).
- To'g'ri quyosh nuri tushmasligi kerak (derazа oldida yo'q).
- Kameraning ko'rish burchagi: kirish yo'lida to'g'ri frontal.

---

## Tekshiruv ro'yxati (har bir terminal uchun)

- [ ] Statik IP, gateway bo'sh, VLAN 50
- [ ] Default parol almashtirilgan
- [ ] NTP yoqilgan, vaqt server bilan ±60 s
- [ ] HTTP Host Notification URL to'g'ri, token kiritilgan
- [ ] `Test` tugmasi "Online" ko'rsatadi
- [ ] Yuzni ko'rsatganda log panelda paydo bo'ladi
- [ ] Panelda terminal "Offline" bo'lib qolmaydi
