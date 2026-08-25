# 📷 POC: getUserMedia (สิทธิ์กล้อง/ไมค์) — Next.js

ทดสอบการขอ **permission กล้อง/ไมค์** ด้วย `navigator.mediaDevices.getUserMedia` ครบทุกรูปแบบใน **หน้าเดียว**
พร้อม **error logging** ครบทั้ง 3 ชั้น: console → หน้าจอ → ไฟล์ `logs/client.log`

> สร้างด้วย Next.js 16 (App Router + TypeScript)

---

## 🚀 วิธีรัน

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000**

> ⚠️ **สำคัญ:** `getUserMedia` ทำงานได้เฉพาะบน **HTTPS หรือ localhost** เท่านั้น
> ถ้าเปิดผ่าน `http://` (เครื่องอื่น) หรือ `file://` จะโดน `SecurityError`

---

## 🧪 ทดสอบอะไรได้บ้าง (ในหน้าเดียว)

| หัวข้อ | รายละเอียด |
|---|---|
| **สถานะสิทธิ์** | Permissions API (`navigator.permissions.query`) เช็คสถานะ `prompt / granted / denied` ของกล้อง+ไมค์ แบบ realtime |
| **ขอสิทธิ์ 7 แบบ** | `video: true`, HD 720p, FHD 1080p, `facingMode: user` (กล้องหน้า), `facingMode: environment` (กล้องหลัง), กล้อง+ไมค์, ไมค์อย่างเดียว |
| **deviceId** | `enumerateDevices()` + เลือกกล้องจากรายการ แล้วขอด้วย `{ deviceId: { exact } }` |
| **แชร์หน้าจอ** | `getDisplayMedia()` |
| **พรีวิว** | ดูภาพสด + แสดง `getSettings()` (resolution, fps, facingMode, deviceId) และรายชื่อ tracks |
| **หยุด stream** | `stop()` ทุก track |

### Error ที่จัดการไว้ (log พร้อมคำแนะนำ)

| Error name | สาเหตุ |
|---|---|
| `NotAllowedError` | ผู้ใช้ปฏิเสธสิทธิ์ / เคยกด Block ไว้ |
| `NotFoundError` | ไม่พบกล้อง/ไมค์ในเครื่อง |
| `NotReadableError` | อุปกรณ์ถูกแอปอื่นยึด (Zoom, Teams, OBS...) |
| `OverconstrainedError` | constraint ที่ขอเกินความสามารถอุปกรณ์ |
| `SecurityError` | ไม่ได้รันบน HTTPS/localhost |
| `AbortError` | มีคำขอ getUserMedia อื่นค้างอยู่ |
| `TypeError` | constraints ไม่ถูกต้อง |

---

## 📝 Logging ทำงานยังไง

ทุก event (ขอสิทธิ์, สำเร็จ, error, อุปกรณ์, เปลี่ยนสิทธิ์) จะถูกบันทึก **3 ที่พร้อมกัน**:

1. **Browser console** — `console.log/warn/error` (F12)
2. **หน้าจอ** — Log panel ด้านล่างของหน้า (มีปุ่ม คัดลอก / ดาวน์โหลด / ล้าง)
3. **ไฟล์ `logs/client.log`** — เขียนผ่าน API route `POST /api/log` ฝั่ง server
   (รูปแบบ JSON 1 บรรทัด/event: timestamp, level, category, message, detail, url, userAgent, ip)

> ไฟล์ `logs/*.log` ถูก gitignore ไว้ (push เฉพาะ folder ผ่าน `.gitkeep`)
> แต่ถ้าอยากให้ log ขึ้น git ด้วย ให้ลบบรรทัด `logs/*.log` ออกจาก `.gitignore`

---

## 📁 โครงสร้าง

```
app/
├── page.tsx            # หน้า POC ทั้งหมด (client component ไฟล์เดียว)
├── layout.tsx
├── globals.css
└── api/
    └── log/
        └── route.ts    # POST /api/log — เขียน log ลง logs/client.log
logs/
└── .gitkeep            # folder เก็บ log (ไฟล์ log จริงโดน gitignore)
```

---

## 📌 หมายเหตุ POC

- บนมือถือต้องเปิดผ่าน **HTTPS** (localhost บนเครื่องตัวเองใช้ได้) และต้องใช้เบราว์เซอร์ที่รองรับ
- Safari/Firefox **ไม่รองรับ** `permissions.query({name: 'camera'})` — หน้าเว็บจะแสดง "ไม่รองรับ" และแนะนำให้ขอสิทธิ์ผ่านปุ่ม getUserMedia ตรงๆ แทน
- `enumerateDevices()` จะเห็น **label** ของอุปกรณ์เฉพาะหลังได้รับสิทธิ์แล้วเท่านั้น
- ถ้า user เคยกด **Block** ไปแล้ว ต้องไปรีเซ็ตสิทธิ์ที่ตั้งค่าเบราว์เซอร์ (🔒 ข้าง address bar → Site settings) หรือที่ Windows Settings → Privacy → Camera/Microphone
