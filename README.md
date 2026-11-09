# CWN สบายจัง รีสอร์ท · เว็บจองโรงแรม (การบ้าน AI Vibecode)

เว็บจองห้องพักของรีสอร์ทสมมติริมหาดกะตะ ภูเก็ต ทำครบ 56 user story ตั้งแต่ค้นหาห้อง ราคาตามซีซั่น โปรโมชั่น จองและจ่ายเงิน (จำลอง) ยกเลิก/เปลี่ยนวัน สมาชิกและแต้ม ไปจนถึงหลังบ้านของพนักงาน 4 บทบาท พัฒนาแบบ TDD

## 🌐 Demo

**https://hotel.c.bu8-sd.com**

| ลองอะไร | ทำอย่างไร |
|---|---|
| จองห้อง | กด "จองห้อง" → เลือกวัน → เลือกแผนราคา → กรอกข้อมูล → จ่ายด้วยบัตร `4242 4242 4242 4242` (บัตร `4000 0000 0000 0002` = ถูกปฏิเสธ) หรือ PromptPay กด "จ่ายแล้ว" |
| เป็นสมาชิก | dropdown "ใช้งานในชื่อ" มุมขวาบน → **คุณแนน** (ราคาสมาชิก แต้ม เดือนเกิด ส.ค.) · **คุณพลอย** = ยังไม่ยืนยันอีเมล |
| หลังบ้าน | เลือก **คุณวิภา (GM)** → เมนู "หลังบ้าน" · หรือ คุณกอล์ฟ (SALES) · น้องมุก (FRONT) · พี่ชัย (ROOMS) ดูว่าแต่ละบทบาทเห็นเมนูต่างกัน |
| อีเมล / LINE ที่ระบบส่ง | เลือก คุณวิภา หรือ น้องมุก → หลังบ้าน → Outbox |
| ภาษาอังกฤษ | ปุ่ม EN ข้าง dropdown |

"วันนี้" ของเว็บเริ่มที่ **1 มี.ค. 2027 10:00** แล้วเดินตามเวลาจริง · เว็บสาธิตเท่านั้น ไม่มีการเก็บเงินจริง ไม่ต้องใส่ข้อมูลจริง

| | |
|---|---|
| Stack | Next.js 15 (App Router, TypeScript) · PostgreSQL 16 (`pg`, SQL ตรง) · Docker · Vitest · Playwright |
| เทสต์ | unit + integration 248 ข้อ · E2E 5 ข้อ (Chrome + Pixel 7) ผ่านทั้งหมด |
| เข้าสู่ระบบ | เว็บสาธิต: เลือกผู้ใช้จาก dropdown ไม่มีรหัสผ่าน · บริการภายนอก (จ่ายเงิน อีเมล LINE) จำลองทั้งหมด |
| Deploy | Coolify (Dockerfile build บนเซิร์ฟเวอร์ + PostgreSQL 16) · รายละเอียด [`devops/README.md`](devops/README.md) |
| Claude skill | [`skill/`](skill/) · **coolify-deploy**: deploy แอปขึ้น sandbox ของทีม `*.c.bu8-sd.com` (ไม่รวม API key ขอจากทีม DevOps) · ผลทดสอบบน sandbox จริง [`skill/TESTING.md`](skill/TESTING.md) |

**รันในเครื่อง:** ดู [`sabaijang/RUN.md`](sabaijang/RUN.md) (Docker 2 คำสั่ง แล้วเปิด http://localhost:3100)

| เอกสาร | มีอะไร |
|---|---|
| [`USER-STORIES-HOTEL.md`](USER-STORIES-HOTEL.md) | 56 user story พร้อมเกณฑ์ยอมรับ |
| [`sabaijang/interview/`](sabaijang/interview/) | บันทึกสัมภาษณ์ + คำตอบจากโรงแรม |
| [`sabaijang/DESIGN.md`](sabaijang/DESIGN.md) · [`DESIGN.html`](sabaijang/DESIGN.html) | Architecture · บทบาทและสิทธิ์ · Use Case · Flowchart 5 · ERD · Sequence 4 |
| [`sabaijang/IMPLEMENTATION-PLAN.md`](sabaijang/IMPLEMENTATION-PLAN.md) | แผน TDD M0–M9 และ port/adapter ของบริการที่จำลอง |
| [`sabaijang/web/API-CONTRACT.md`](sabaijang/web/API-CONTRACT.md) | API ทุกเส้น |
| [`prompts/`](prompts/) | พรอมต์ LAB 0–13 |

รูปทั้งหมดมาจากคลังภาพฟรี ไม่ใช่รูปโรงแรมจริง ที่มาและสัญญาอนุญาตอยู่ใน [`sabaijang/brand-kit/CREDITS.md`](sabaijang/brand-kit/CREDITS.md) และหน้า `/credits` ของเว็บ

---

## ชุดบทเรียน (LAB 0–13)

ใช้เดินบทเรียนแบบเดียวกับเว็บสปา (LAB 0–13) แต่เปลี่ยนโจทย์เป็นเว็บจองโรงแรม ภูเก็ต 56 user story

## โครงโฟลเดอร์

```text
├─ README.md                 ไฟล์นี้
├─ USER-STORIES-HOTEL.md     56 story · Q1–Q16
├─ prompts/                  พรอมต์ทุก LAB (lab0.md … lab13.md)
└─ sabaijang/
   ├─ interview/             INTERVIEW.md · OWNER-ANSWERS.md
   ├─ brand-kit/             README.md + CREDITS.md (ไฟล์รูปอยู่ที่ web/public/brand/)
   ├─ db/                    docker-compose + schema/seed
   ├─ web/                   เว็บ Next.js + เทสต์
   └─ DESIGN.md · IMPLEMENTATION-PLAN.md · RUN.md
```

## ค่าที่ตกลงแล้ว

| เรื่อง | ค่า |
|---|---|
| โรงแรม | CWN สบายจัง รีสอร์ท · CWN Sabai Jang Resort · หาดกะตะ ภูเก็ต (สนามบิน HKT) |
| ขอบเขต | ครบทั้ง 56 story |
| ปีทดสอบ | 2027 (ตรุษจีน Peak 5–8 ก.พ. 2027) |
| Docker | `hotel-web` :3100 · `hotel-db` :5434 · network `hotel-net` · volume `hotel-pgdata` (เปิดพร้อมเว็บสปา 3000/5433 ได้) |
| ชุดทดสอบขนาน (LAB 12–13) | `hotel-web-<N>` / `hotel-db-<N>` พอร์ต `32<N>0` |
| ภาษาเว็บ | ไทย + อังกฤษ (จีนเลื่อนไปปีหน้าตามคำตอบโรงแรม) |
| บริการภายนอก | จ่ายเงิน อีเมล LINE อัตราแลกเปลี่ยน แผนที่ = จำลองทั้งหมด · อีเมลดูที่ `/admin/outbox` |
| hook ทดสอบที่เพิ่มจากสปา | `POST /api/test/clock` เลื่อนนาฬิกาโดยไม่ล้างข้อมูล (ล็อก 15 นาที · Flash Sale · เวลายกเลิกฟรี · No-show) |

## ลำดับ LAB

| LAB | พรอมต์ | อ่าน | ได้ไฟล์ | ต่างจากสปาตรงไหน |
|---|---|---|---|---|
| 0 | `lab0.md` | - | ตารางความพร้อม | พอร์ต 3100 / 5434 · นับรูปตามโฟลเดอร์ |
| 1 | `lab1.md` | INTERVIEW | `USER-STORIES.md` | ต้องมีตารางข้อมูลตั้งต้น (R01–R06, PR-xx) · เทียบกับ `USER-STORIES-HOTEL.md` |
| 2 | `lab2.md` | US + OWNER-ANSWERS | `REQUIREMENTS.md` | BR เวลาและวันที่แยกข้อ · ลำดับคิดเงินเป็นขั้น · NFR เลื่อนนาฬิกาได้ |
| 3 | `lab3.md` | US + REQ | `DESIGN.md` `design/*.png` | Flowchart 4 · Sequence 4 (ห้องสุดท้าย · ล็อกหมดเวลา · เช็กเอาต์แล้วแต้มเข้า) · ERD นับห้องรายคืน |
| 4 | `lab4.md` | REQ + DESIGN + ANSWERS | `TEST-DATA.md` | วันล็อก 1 ค่า + ตาราง "วันนี้ที่ test ส่งเอง" · ผู้ใช้ ≥ 10 · การจองตั้งต้นหลายสถานะ |
| 5 | `lab5.md` | REQ DESIGN DATA brand-kit | `BUILD-PROMPT.md` | API 6 ตัว + หน้าเว็บ 8 ตัว · หน้า `/credits` (รูป CC BY ต้องให้เครดิต) · ≤ 190 บรรทัด |
| 6 | `lab6.md` | BUILD-PROMPT | `db/` `web/` | วางเนื้อหา BUILD-PROMPT.md ในหน้าต่างใหม่ · ค้างใช้ `lab6-resume.md` |
| 7 | `lab7.md` | REQ DATA SPEC | `CHARTERS.md` | ของกลาง = ห้องว่างรายคืน ล็อก 15 นาที โค้ดจำกัดสิทธิ์ Flash Sale · charter ปิดท้ายรวมเรื่องเลื่อนนาฬิกา |
| 8 | `lab8.md` | CHARTERS | `exploration/` | ตรวจอีเมลจำลองใน outbox ด้วย |
| 9 | `lab9.md` + `lab9-judge.md` | exploration | `EXPLORATION.md` | P1 เพิ่ม "ขายห้องเกิน · ตัดเงินแต่ไม่ได้ห้อง" |
| 10 | `lab10.md` (+ `lab10-continue.md`) | REQ DATA EXPLORATION | `TEST-PLAN.md` `plan/` | 8 กลุ่มตามหมวด story · test บังคับ 14 แบบ |
| 11 | `lab11.md` | TEST-PLAN | `PLAN-REVIEW.md` `review/` | ตรวจเรื่องห้อง/วันที่/บัญชีชนกันตอนรันขนาน |
| 12 | `lab12.md` | TEST-PLAN SPEC | `e2e/index.html` | fixture ส่ง "วันนี้" เอง + clock + อ่าน outbox · 2 context จ่ายพร้อมกันจริง |
| 13 | `lab13.md` (+ `lab13-continue.md`) | e2e | `BUG-HUNT.md` | เหมือนสปา |

## จุดที่ตั้งใจวางไว้ให้สอน

**เรื่องที่พูดขัดกันใน INTERVIEW** (LAB 1 ควรจับได้ · LAB 2 ใช้ OWNER-ANSWERS ตัดสิน)

| เรื่อง | ใครพูด | OWNER-ANSWERS ตัดสิน |
|---|---|---|
| ยกเลิกฟรี | คุณวิภา 3 วัน · น้องมุก 1 วัน | 3 วัน / Peak 14 วัน ถึง 14:00 (§6) |
| โปรช่วง Peak | คุณวิภา "ไม่ลดเลย" · คุณกอล์ฟ "Long Stay ทั้งปี" | Early Bird ได้ · Long Stay, Stay 4 Pay 3, Last Minute ไม่ได้ (§7) **ต่างจาก US-20 ในเฉลยที่สมมติว่าได้** |
| การจ่ายเงิน | คุณวิภา "จ่ายเต็ม" | มัดจำ 30% แผนยกเลิกได้ · เต็มเฉพาะ Non-refundable (§5) |

**Q1–Q16 ใน `USER-STORIES-HOTEL.md` → คำตอบ**

| Q | สถานะ | ที่ไหน |
|---|---|---|
| Q1 ห้อง ราคา จำนวน | ✅ ยืนยัน + เลขห้อง เตียง วิว | §2 |
| Q2 ซีซั่นปีนี้ | ✅ ปี 2027 ครบ | §3 |
| Q3 ราคาสุดสัปดาห์ | ✅ เท่าวันธรรมดา | §3 |
| Q4 อายุเด็ก | ✅ ต่ำกว่า 12 · นับ ณ วันเช็กอิน | §4 |
| Q5 มัดจำ / ผู้ให้บริการ | ✅ 30% · ใช้หน้าจ่ายจำลอง | §5 |
| Q6 นโยบายยกเลิก | ✅ | §6 |
| Q7 ซ้อนโปร / Peak | ✅ (เปลี่ยนสมมติฐาน US-20) | §7 |
| Q8 ปัดเศษ | ✅ ปัดลงครั้งเดียวที่ยอดสุดท้าย | §5 |
| Q9 จองวันเดียวกันถึงกี่โมง | ✅ 20:00 | §5 |
| Q10 Gala Dinner 31 ธ.ค. | ⚠️ ยังไม่ตอบ | §11 |
| Q11 ไอเดียโปรเพิ่ม | ✅ ยังไม่ทำ | §7 |
| Q12 OTA | ✅ ขาย Agoda แต่ไม่ต้องเชื่อม | §5 |
| Q13 ภาษา / ล็อกอิน Google LINE | ภาษา ✅ · ล็อกอิน ⚠️ | §8, §11 |
| Q14 แต้ม | อัตรา ✅ · วันหมดอายุ ⚠️ | §8, §11 |
| Q15 ใบกำกับภาษี | ⚠️ ยังไม่ตอบ | §11 |
| Q16 ลำดับความสำคัญ | ✅ ยืนยัน + ทำครบทุกข้อ | §8 |

ตอบ 12 ข้อเต็ม · ตอบบางส่วน 2 ข้อ · ยังไม่ตอบ 2 ข้อ · และ §11 มีเรื่องใหม่ 2 ข้อ (ยกเลิกบางห้อง · เปลี่ยนวันกี่ครั้ง)

**ข้อมูลที่ช่วยให้ทดสอบค่าขอบได้** (§10): แต้ม 99 / 120 / 250 · สมาชิกยังไม่ยืนยันอีเมล · สิทธิ์เดือนเกิดใช้แล้ว / ยังไม่ใช้ · ลูกอายุครบ 4 ปี 15 ม.ค. 2028 (คร่อม Peak ปลายปี) · โค้ดใช้ได้ / ครบสิทธิ์ / หมดอายุ · บัตรจ่ายสำเร็จ / ถูกปฏิเสธ

## เรื่องรูป

รูปทั้งหมดมาจากคลังภาพฟรี (StockSnap CC0, Flickr / Wikimedia Commons ที่เป็น CC0, Public Domain, CC BY, CC BY-SA) ไม่ใช่รูปของโรงแรมจริง รายละเอียดทุกรูปอยู่ใน `sabaijang/brand-kit/CREDITS.md` รูป CC BY / CC BY-SA ต้องให้เครดิต LAB 5 จึงสั่งให้เว็บมีหน้า `/credits`
