# วิธีรันเว็บ CWN สบายจัง รีสอร์ท

```bash
cd db  && docker compose up -d                 # hotel-db :5434 · hotel-db-test :5435 · network hotel-net
cd ../web && docker compose up -d --build      # hotel-web :3100 (CLOCK_MODE=ticking, ALLOW_TEST_RESET=1)
```

เปิด http://localhost:3100 · "วันนี้" ของเว็บเริ่มที่ 1 มี.ค. 2027 10:00 แล้วเดินตามเวลาจริง

| ทำอะไร | วิธี |
|---|---|
| เลือกผู้ใช้ (demo login) | dropdown "ใช้งานในชื่อ" มุมขวาบน: สมาชิก คุณแนน / คุณอ้อม / คุณพลอย (ยังไม่ยืนยันอีเมล) / Ms. Chen · ทีมงาน คุณวิภา GM / คุณกอล์ฟ SALES / น้องมุก FRONT / พี่ชัย ROOMS |
| บัตรทดสอบ | `4242 4242 4242 4242` สำเร็จ · `4000 0000 0000 0002` ถูกปฏิเสธ · PromptPay กด "จ่ายแล้ว" |
| อีเมล / LINE ที่ระบบ "ส่ง" | เลือก คุณวิภา หรือ น้องมุก → หลังบ้าน → Outbox |
| ล้างข้อมูลกลับเป็นค่าเริ่มต้น | `curl -X POST localhost:3100/api/test/reset -H "content-type: application/json" -d "{\"now\":\"2027-03-01T10:00:00+07:00\"}"` |
| เลื่อนนาฬิกา | `curl -X POST localhost:3100/api/test/clock -H "content-type: application/json" -d "{\"advanceMinutes\":15}"` |

## เทสต์ (ใน `web/`)

```bash
npm ci
npm test                 # unit + integration (Postgres :5435) · 246 ข้อ
npx playwright install chromium
npx playwright test      # E2E บนเว็บที่รันอยู่ :3100 · Chrome + Pixel 7
```

เว็บสาธิตเท่านั้น: ทุกคนสลับเป็นผู้จัดการได้ ไม่มีการเก็บเงินจริง ห้ามใส่ข้อมูลจริง · เปิดสาธารณะให้ตั้ง `ALLOW_TEST_RESET=0`
