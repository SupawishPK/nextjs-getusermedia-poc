# 📷 POC: getUserMedia (สิทธิ์กล้อง/ไมค์) — Next.js

ทดสอบการขอ **permission กล้อง/ไมค์** ด้วย `navigator.mediaDevices.getUserMedia` ครบทุกรูปแบบใน **หน้าเดียว**
พร้อม **error logging** ครบ 3 ชั้น: console → หน้าจอ → localStorage (ดาวน์โหลดเป็นไฟล์ได้)

> สร้างด้วย Next.js 16 (App Router + TypeScript) — deploy ได้ทั้ง local dev และ **GitHub Pages** (static export)

🔗 **GitHub Pages (live):** https://supawishpk.github.io/nextjs-getusermedia-poc/

---

## 🚀 วิธีรัน (local dev)

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000**

> ⚠️ **สำคัญ:** `getUserMedia` ทำงานได้เฉพาะบน **HTTPS หรือ localhost** เท่านั้น
> ถ้าเปิดผ่าน `http://` (เครื่องอื่น) หรือ `file://` จะโดน `SecurityError`
> **GitHub Pages มี HTTPS ให้อัตโนมัติ** จึงทดสอบบนมือถือผ่านลิงก์ Pages ได้เลย

---

## 🌐 Deploy ขึ้น GitHub Pages

Repo นี้ deploy ด้วยวิธี **gh-pages branch** — push ไฟล์ static ที่ build เสร็จแล้วตรงๆ ขึ้น branch `gh-pages`
(วิธีนี้ใช้ token ที่ไม่มี `workflow` scope ได้ ไม่ต้องพึ่ง GitHub Actions)

### Deploy (ทุกครั้งที่อัปเดตโค้ด)

```bash
# 1) build static export (Windows PowerShell ใช้ $env:DEPLOY_TARGET="gh-pages")
DEPLOY_TARGET=gh-pages npm run build

# 2) อัปเดต branch gh-pages ด้วยเนื้อหาใน out/
git checkout --orphan gh-pages
git rm -rf .
cp -r out/* . && touch .nojekyll
git add -A && git commit -m "deploy: update static site"
git push origin gh-pages

# 3) กลับไปทำงานที่ master
git checkout master
```

### ตั้งค่า Pages (ทำครั้งแรกครั้งเดียว)

ไปที่ **Settings → Pages** → Build and deployment → Source เลือก **"Deploy from a branch"** → branch `gh-pages` / folder `/ (root)` → Save

> 💡 **อยากได้ auto-deploy ไหม?** (push master แล้ว deploy อัตโนมัติ) ต้องใช้ PAT ที่มี **`workflow` scope**
> ถึงจะ push ไฟล์ `.github/workflows/deploy.yml` ได้ — workflow file พร้อมใช้อยู่ที่ `~/deploy-backup/deploy.yml`
> สร้าง PAT ใหม่ที่ https://github.com/settings/tokens (ติ๊ก scope `workflow` + `repo`) แล้วย้ายไฟล์กลับเข้า
> `.github/workflows/` push ขึ้น master เท่านี้ก็ auto-deploy ต่อจากนั้น

---

## 🧪 ทดสอบอะไรได้บ้าง (ในหน้าเดียว)

| หัวข้อ | รายละเอียด |
|---|---|
| **สถานะสิทธิ์** | Permissions API (`navigator.permissions.query`) เช็คสถานะ `prompt / granted / denied` ของกล้อง+ไมค์ แบบ realtime |
| **ขอสิทธิ์ 7 แบบ** | `video: true`, HD 720p, FHD 1080p, `facingMode: user` (กล้องหน้า), `facingMode: environment` (กล้องหลัง), กล้อง+ไมค์, ไมค์อย่างเดียว |
| **deviceId** | `enumerateDevices()` + เลือกกล้องจากรายการ แล้วขอด้วย `{ deviceId: { exact } }` — คลิก deviceId เพื่อคัดลอก, auto-rescan เมื่อเสียบ/ถอดอุปกรณ์ (`devicechange` event) |
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
3. **localStorage** (key `gum-poc-logs`) — เก็บ ~500 รายการล่าสุด **รอดข้าม reload** และใช้ได้ทั้ง dev และ static export (GitHub Pages ไม่มี server ให้ POST log)

> 💡 **ทำไมไม่มี API route?** GitHub Pages เป็น static อย่างเดียว รองรับแค่ GET — `POST /api/log`
> จึงไปต่อไม่ได้ เลยออกแบบ logging อยู่ฝั่ง client (localStorage) ซึ่งทำงานเหมือนกันทุก environment
> ถ้าอยากได้ server-side log จริง ต้อง deploy ที่มี Node server (Vercel, Railway, VPS...)

---

## 📁 โครงสร้าง

```
app/
├── page.tsx            # หน้า POC ทั้งหมด (client component ไฟล์เดียว)
├── layout.tsx
└── globals.css
next.config.ts          # output: export + basePath ตอน DEPLOY_TARGET=gh-pages
out/                    # ผลลัพธ์ static export (สร้างตอน build, โดน gitignore บน master)
gh-pages branch         # เนื้อหา out/ + .nojekyll — ใช้เป็น source ของ GitHub Pages
```

---

## 📌 หมายเหตุ POC

- บนมือถือต้องเปิดผ่าน **HTTPS** — ใช้ลิงก์ GitHub Pages ได้เลย
- Safari/Firefox **ไม่รองรับ** `permissions.query({name: 'camera'})` — หน้าเว็บจะแสดง "ไม่รองรับ" และแนะนำให้ขอสิทธิ์ผ่านปุ่ม getUserMedia ตรงๆ แทน
- `enumerateDevices()` จะเห็น **label** ของอุปกรณ์เฉพาะหลังได้รับสิทธิ์แล้วเท่านั้น
- ถ้า user เคยกด **Block** ไปแล้ว ต้องไปรีเซ็ตสิทธิ์ที่ตั้งค่าเบราว์เซอร์ (🔒 ข้าง address bar → Site settings) หรือที่ Windows Settings → Privacy → Camera/Microphone
