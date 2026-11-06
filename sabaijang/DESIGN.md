# Design · CWN สบายจัง รีสอร์ท (CWN Sabai Jang Resort)

ที่มา: `../USER-STORIES-HOTEL.md` (56 story) และ `interview/OWNER-ANSWERS.md` รอบที่ 2 · ทุกแผนภาพเป็น Mermaid และ render เป็นภาพไว้ที่ `design/<ชื่อ>.png`

**วิธีอ่าน**

- อ้างกฎด้วยรหัส story `US-xx` และหัวข้อคำตอบโรงแรม `§x` (เอกสารนี้ข้าม LAB 2 จึงยังไม่มีรหัส FR / BR)
- **⚠️ D-xx** = ทีมตัดสินใจเองระหว่างออกแบบ ดูหัวข้อ 6
- ห้อง R01–R06 · โปร PR-01–PR-13 ตาม `USER-STORIES-HOTEL.md` · ปีทดสอบ 2027 · เวลาทั้งหมดเป็น Asia/Bangkok

| แผนภาพ | จำนวน | ไฟล์ |
|---|---:|---|
| System Architecture | 1 | `architecture.png` |
| Use Case | 1 | `use-case.png` |
| Flowchart | 5 | `flow-search.png` `flow-booking.png` `flow-cancel.png` `flow-price.png` `flow-checkout.png` |
| ERD | 1 | `erd.png` |
| Sequence | 4 | `seq-booking.png` `seq-race.png` `seq-hold-expire.png` `seq-checkout.png` |

---

## 1. System Architecture

<!-- diagram: architecture -->
```mermaid
flowchart LR
  subgraph HOST["เครื่องผู้ใช้ (localhost)"]
    PW["Playwright<br/>ขับเบราว์เซอร์ · ยิง API"]
    TOOL["psql / สคริปต์ตรวจฐานข้อมูล"]
    subgraph BROWSER["เบราว์เซอร์"]
      UI["หน้าเว็บ React<br/>ไทย / English"]
      PANO["หมุนดู 360°<br/>R03 R05 R06 · US-49"]
      FX["แสดงราคาประมาณ USD EUR CNY<br/>US-46"]
    end
  end

  subgraph NET["Docker network: hotel-net"]
    subgraph P1["โปรเจกต์ Docker: hotel-web"]
      subgraph WEB["container hotel-web · Next.js App Router + TypeScript · พอร์ต 3100"]
        PAGES["หน้าเว็บ<br/>/th /en · /admin"]
        API["API<br/>Route Handlers /api/*"]
        RULES["กฎโรงแรม lib/rules<br/>ห้องว่าง ราคา โปร ยกเลิก แต้ม"]
        CLOCK["นาฬิกา lib/clock<br/>เวลาจริง หรือเวลาล็อก + เลื่อน"]
        DATA["ชั้นข้อมูล lib/db<br/>SQL + transaction"]
        SIM["บริการจำลอง<br/>จ่ายเงิน · outbox อีเมล/LINE"]
      end
    end
    subgraph P2["โปรเจกต์ Docker: hotel-db"]
      DB[("container hotel-db<br/>PostgreSQL 16<br/>พอร์ตภายใน 5432")]
    end
  end

  subgraph EXT["บริการภายนอกจริง · รุ่นนี้ยังไม่ต่อ"]
    PSP["ผู้ให้บริการรับชำระเงิน"]
    MAIL["อีเมล / LINE กลุ่มโรงแรม"]
    OTA["Agoda / Channel Manager"]
  end

  PW -->|"ควบคุม"| UI
  PW -->|"/api/test/reset · /api/test/clock"| API
  UI -->|"HTTP localhost:3100"| PAGES
  UI -->|"HTTP localhost:3100/api"| API
  PAGES --> DATA
  API --> RULES
  API --> SIM
  API --> DATA
  RULES --> CLOCK
  SIM --> DATA
  DATA -->|"hotel-db:5432 ผ่าน hotel-net"| DB
  TOOL -->|"127.0.0.1:5434 → 5432"| DB
  SIM -.->|"แทนที่ภายหลัง"| PSP
  SIM -.->|"แทนที่ภายหลัง"| MAIL
  DATA -.-x|"ไม่เชื่อม §5"| OTA
```

ภาพ: `design/architecture.png`

| ชั้น | อยู่ที่ไหน | หน้าที่ | ทดสอบด้วยอะไร |
|---|---|---|---|
| หน้าเว็บฝั่งเบราว์เซอร์ | เบราว์เซอร์ | แสดงผล 2 ภาษา เก็บค่าที่กรอกระหว่างขั้นจอง แสดงยอดที่ API คิดให้ **ไม่คิดราคาเอง** | Playwright จอ 375×812 และ 1280 · สลับภาษากลางทาง (US-45) |
| 360° และสกุลเงิน | เบราว์เซอร์ | หมุนภาพ `pano-*` · คูณอัตราคงที่ที่ API ส่งมา (ตัดเงินเป็นบาทเสมอ) | Playwright ลากหมุนบนมือถือ · ตรวจข้อความ "เรียกเก็บเป็นเงินบาท" |
| หน้าเว็บฝั่งเซิร์ฟเวอร์ | `hotel-web` | สร้างหน้า `/th` `/en` ห้องพัก โปร ข้อมูลโรงแรม และหลังบ้าน `/admin` ตามบทบาท | Playwright · Lighthouse หน้าแรก ≤ 3 วินาที |
| API | `hotel-web` | ตรวจสิทธิ์ เรียกกฎ เปิด transaction แปลง error เป็นข้อความ 2 ภาษา | Playwright ยิง API ตรง (ไม่ login, ผิดบทบาท, ของคนอื่น) |
| กฎโรงแรม | `hotel-web` `lib/rules` | ฟังก์ชันล้วน: ซีซั่นรายคืน ราคา โปร มัดจำ เวลายกเลิกฟรี แต้ม อายุเด็ก | Vitest ทุกค่าขอบ (ต่ำกว่า / ที่ขอบ / เกินขอบ) |
| นาฬิกา | `hotel-web` `lib/clock` + `app_settings` | ให้ "ตอนนี้" แก่ทุกกฎ · ล็อกและเลื่อนได้เมื่อ `ALLOW_TEST_RESET=1` | `/api/test/clock` แล้วตรวจล็อก 15 นาที Flash Sale เวลายกเลิก |
| บริการจำลอง | `hotel-web` `lib/sim` | จ่ายเงินตามเลขบัตรทดสอบ · เขียนอีเมลและ LINE ลงตาราง `outbox_messages` | อ่าน `/admin/outbox` |
| ฐานข้อมูล | `hotel-db` | เก็บข้อมูลจริง และบังคับกฎสุดท้ายด้วย CHECK, UNIQUE, row lock | psql ผ่าน `127.0.0.1:5434` · Playwright จ่ายพร้อมกัน 2 context |

**อะไรทำที่ไหน**

| ทำในเบราว์เซอร์ | ทำที่เซิร์ฟเวอร์ (`hotel-web`) |
|---|---|
| เลือกวันที่ จำนวนคน อายุเด็ก (ตรวจเบื้องต้นเพื่อ UX เท่านั้น) | ตรวจกฎวันที่ คนสูงสุด ห้องว่างทุกคืน (US-01, US-02, US-03) |
| นับถอยหลัง 15 นาทีจาก `hold_expires_at` ที่ API ส่งมา | ล็อกห้องและปล่อยห้องเมื่อหมดเวลา (US-33) |
| หมุน 360° (US-49) · แปลงสกุลเงินเพื่อแสดง (US-46) | คิดราคา โปร มัดจำ แต้ม (US-11 – US-29, US-34, US-43) |
| แถบสรุปราคาติดล่างจอ (US-08) | จ่ายเงินจำลอง อีเมล LINE (US-34, US-35, US-55) |
| แชตบอต: ส่งข้อความเท่านั้น | แชตบอตตอบด้วยตารางกฎตายตัว (US-50) |

---

## 2. Use Case

<!-- diagram: use-case -->
```mermaid
flowchart LR
  G(["ผู้เข้าพักทั่วไป<br/>(คุณต่อ, Mr. Daniel)"])
  F(["ครอบครัว<br/>(คุณอ้อม)"])
  C(["คู่รัก<br/>(คุณพลอย & คุณเจ)"])
  M(["สมาชิก<br/>(คุณแนน, Ms. Chen)"])
  GM(["ผู้จัดการทั่วไป<br/>(คุณวิภา)"])
  SA(["ฝ่ายขายและการตลาด<br/>(คุณกอล์ฟ)"])
  FD(["พนักงานต้อนรับ<br/>(น้องมุก)"])
  RM(["ฝ่ายห้องพัก<br/>(พี่ชัย)"])

  subgraph WEB["หน้าเว็บ"]
    U1["ค้นหาห้องว่าง · ปฏิทินราคา<br/>US-01 US-02 US-09"]
    U2["ดูห้อง รูป 360° เปรียบเทียบ<br/>US-04 US-10 US-49"]
    U3["เลือกแผนราคา เด็ก เตียงเสริม หลายห้อง<br/>US-05 US-06 US-07"]
    U4["จองและจ่ายเงิน 4 ขั้น<br/>US-08 US-32 – US-38"]
    U5["ใช้โปร โค้ด แพ็กเกจ<br/>US-16 – US-29 US-31"]
    U6["จัดการการจอง ยกเลิก เปลี่ยนวัน<br/>US-39 US-40 US-41"]
    U7["สมัคร แต้ม ประวัติ ลบบัญชี<br/>US-42 US-43 US-44 US-56"]
    U8["รีวิว แชตบอต ภาษา สกุลเงิน ข้อมูลโรงแรม<br/>US-45 – US-48 US-50"]
  end

  subgraph ADMIN["หลังบ้าน /admin"]
    A1["ตั้งซีซั่น ราคา ราคาเฉพาะวัน<br/>US-15 US-52"]
    A2["สร้าง แก้ ปิดโปร โค้ด Flash Sale<br/>US-28 US-30"]
    A3["รายการแขก เช็กอิน เช็กเอาต์ No-show<br/>US-53"]
    A4["ยืนยันบริการเสริม · ดู outbox<br/>US-37 US-55"]
    A5["ปิดห้องซ่อม แก้ข้อมูลห้อง<br/>US-51"]
    A6["รายงาน ดาวน์โหลด Excel<br/>US-54"]
    A7["ตอบรีวิว<br/>US-47"]
  end

  G --> U1 & U2 & U4 & U6 & U8
  F --> U1 & U3 & U4
  C --> U2 & U5 & U4
  M --> U5 & U7 & U8
  SA --> A1 & A2 & A6
  FD --> A3 & A4 & A7
  RM --> A5
  GM --> A1 & A2 & A3 & A4 & A5 & A6 & A7
```

ภาพ: `design/use-case.png` · สิทธิ์หลังบ้านตาม §9: คุณวิภาทุกเมนู · กอล์ฟ A1 A2 A6 · มุก A3 A4 A7 · พี่ชัย A5

### 2.1 บทบาท

| บทบาท | รหัสในระบบ | ใคร | เข้าระบบอย่างไร | ขอบเขต |
|---|---|---|---|---|
| ผู้เข้าพักไม่เป็นสมาชิก | `GUEST` | คุณต่อ, Mr. Daniel, คุณเจ | ไม่ login · เข้าการจองด้วยรหัสการจอง + อีเมล (US-41) | เฉพาะการจองที่รหัสและอีเมลตรงกัน |
| สมาชิกยังไม่ยืนยันอีเมล | `MEMBER_UNVERIFIED` | คุณพลอย | เลือกชื่อจาก dropdown | เหมือน GUEST + บัญชีของตัวเอง · ยังไม่ได้ราคาสมาชิก (§8) |
| สมาชิก | `MEMBER` | คุณแนน, คุณอ้อม, Ms. Chen | เลือกชื่อจาก dropdown | การจอง แต้ม รีวิว บัญชี **ของตัวเองเท่านั้น** |
| ผู้จัดการทั่วไป | `GM` | คุณวิภา | เลือกชื่อจาก dropdown | ทุกเมนูหลังบ้าน |
| ฝ่ายขายและการตลาด | `SALES` | คุณกอล์ฟ | เลือกชื่อจาก dropdown | ซีซั่น ราคา โปร โค้ด Flash Sale รายงาน |
| พนักงานต้อนรับ | `FRONT` | น้องมุก | เลือกชื่อจาก dropdown | รายการแขก เช็กอิน เช็กเอาต์ No-show บริการเสริม outbox รีวิว |
| ฝ่ายห้องพัก | `ROOMS` | พี่ชัย | เลือกชื่อจาก dropdown | ปิดห้องซ่อม ข้อมูลและรูปห้อง |
| ระบบทดสอบ | `TEST` | Playwright | ไม่มีบัญชี · เปิดเมื่อ `ALLOW_TEST_RESET=1` เท่านั้น | `/api/test/reset` `/api/test/clock` |

**เข้าสู่ระบบแบบเว็บสาธิต (demo login)**

- ไม่มีรหัสผ่าน · header ทุกหน้ามี dropdown "ใช้งานในชื่อ" รายชื่อมาจาก `GET /api/demo/users` แสดงเป็น "ชื่อ · บทบาท" และมีตัวเลือกแรก "ไม่เข้าสู่ระบบ (ผู้เข้าพักทั่วไป)"
- เลือกชื่อ → `POST /api/demo/login {userId}` → ตั้ง cookie session (`httpOnly`, `SameSite=Lax`) · เลือก "ไม่เข้าสู่ระบบ" → `POST /api/demo/logout` · เปลี่ยนชื่อแล้วรีโหลดหน้าเดิม ไม่เปลี่ยนหน้า (ใช้ทดสอบ US-22 ข้อ 3)
- สมัครสมาชิก (US-42) ยังมีฟอร์ม: ชื่อ อีเมล วันเกิด ความยินยอมการตลาด · สมัครแล้วชื่อขึ้นใน dropdown ทันทีเป็น `MEMBER_UNVERIFIED` และกดลิงก์ยืนยันอีเมลใน outbox เพื่อเป็น `MEMBER`
- ลบบัญชีแล้วชื่อหายจาก dropdown (US-56)
- **API ยังตรวจสิทธิ์จากบทบาทใน session ทุกเส้นเหมือนเดิม** สิ่งที่เปลี่ยนคือวิธีได้ session มาเท่านั้น
- ทุกหน้ามีป้าย "เว็บสาธิต · เลือกผู้ใช้ได้โดยไม่ต้องใช้รหัสผ่าน" · Google / LINE login (US-42 ข้อ 2) อยู่นอกขอบเขต
- บัญชีทีมงาน (`staff_users`) แยกตารางจากสมาชิก (`users`) แต่อยู่ใน dropdown เดียวกัน · 1 บัญชีมี 1 บทบาท · ทุกการกระทำหลังบ้านบันทึกใน `audit_log`

### 2.2 สิทธิ์ตามบทบาท

✓ = ทำได้ · 👤 = เฉพาะของตัวเอง · – = ทำไม่ได้

| ทำอะไร | GUEST | MEMBER | GM | SALES | FRONT | ROOMS |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| ค้นหา ดูห้อง โปร ข้อมูลโรงแรม แชตบอต | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| จองและจ่ายเงิน | ✓ | ✓ | – | – | – | – |
| ราคาสมาชิก 5% · แต้ม · ส่วนลดเดือนเกิด | – | 👤 | – | – | – | – |
| ดู ยกเลิก เปลี่ยนวันการจอง | 👤 รหัส+อีเมล | 👤 | ✓ | – | ✓ ดูอย่างเดียว | – |
| ประวัติการพัก · จองอีกครั้ง · ลบบัญชี | – | 👤 | – | – | – | – |
| เขียนรีวิว (เช็กเอาต์แล้ว ≤ 30 วัน) | 👤 | 👤 | – | – | – | – |
| ตอบรีวิว | – | – | ✓ | – | ✓ | – |
| ตั้งซีซั่น ราคา ราคาเฉพาะวัน | – | – | ✓ | ✓ | – | – |
| สร้าง แก้ ปิดโปร โค้ด Flash Sale | – | – | ✓ | ✓ | – | – |
| รายการแขก เช็กอิน เช็กเอาต์ No-show | – | – | ✓ | – | ✓ | – |
| ยืนยัน / ปฏิเสธบริการเสริม | – | – | ✓ | – | ✓ | – |
| ดู outbox อีเมลและ LINE | – | – | ✓ | – | ✓ | – |
| ปิดห้องซ่อม แก้ข้อมูลและรูปห้อง | – | – | ✓ | – | – | ✓ |
| รายงาน + ดาวน์โหลด Excel | – | – | ✓ | ✓ | – | – |
| จัดการบัญชีหลังบ้าน | – | – | ✓ | – | – | – |

### 2.3 การตรวจสิทธิ์ที่ API

| กลุ่ม API | ต้องการ | ไม่ login | login แต่ผิดบทบาท / ของคนอื่น |
|---|---|---|---|
| `GET /api/rooms` `/api/search` `/api/promotions` `/api/chat` | ไม่ต้อง | 200 | - |
| `GET /api/demo/users` `POST /api/demo/login` `/api/demo/logout` | ไม่ต้อง (เว็บสาธิต) | 200 · `userId` ไม่มีหรือถูกลบแล้ว → 404 | - |
| `POST /api/holds` `/api/bookings/{code}/pay` | ผู้ที่สร้างการจองนั้น (session หรือ token ที่ได้ตอนล็อกห้อง) | ไม่มี token → 401 | การจองของคนอื่น → 404 |
| `GET/POST /api/manage/{code}` | รหัส + อีเมลตรงกัน หรือ MEMBER เจ้าของ | อีเมลไม่ตรง → 404 "ไม่พบการจอง" · ผิด 5 ครั้ง → 429 | ของคนอื่น → 404 (ไม่บอกว่ามีอยู่) |
| `/api/me/*` | MEMBER หรือ MEMBER_UNVERIFIED | 401 | - |
| `/api/admin/rates/*` `/api/admin/promotions/*` `/api/admin/reports/*` | GM, SALES | 401 | 403 |
| `/api/admin/arrivals/*` `/api/admin/bookings/*` `/api/admin/addons/*` `/api/admin/outbox` | GM, FRONT | 401 | 403 |
| `/api/admin/reviews/*/reply` | GM, FRONT | 401 | 403 |
| `/api/admin/rooms/*` `/api/admin/closures/*` | GM, ROOMS | 401 | 403 |
| `/api/admin/staff/*` | GM | 401 | 403 |
| `/api/test/reset` `/api/test/clock` | `ALLOW_TEST_RESET=1` | ปิดอยู่ → 404 | - |

- ตรวจสิทธิ์ที่ API ทุกเส้น ไม่พึ่งการซ่อนเมนู (D-08) · ตอบ 404 แทน 403 เมื่อเป็นข้อมูลของคนอื่น เพื่อไม่บอกว่ารหัสการจองนั้นมีอยู่จริง
- หน้า `/admin` ซ่อนเมนูที่บทบาทไม่มีสิทธิ์ แต่ถ้าพิมพ์ URL ตรงจะเห็นหน้า "ไม่มีสิทธิ์เข้าถึง"

---

## 3. Flowchart

### 3.1 ค้นหาห้องว่าง

<!-- diagram: flow-search -->
```mermaid
flowchart TD
  S([ผู้เข้าพักกรอกวันที่ ผู้ใหญ่ เด็ก]) --> A{"เด็กกรอกอายุครบทุกคน?<br/>US-01 ข้อ 3"}
  A -- ไม่ --> E1["ค้นหาไม่ได้ · ชี้ช่องอายุที่ขาด"]
  A -- ใช่ --> B{"เช็กเอาต์ > เช็กอิน?<br/>US-01 ข้อ 4"}
  B -- ไม่ --> E2["กรุณาเลือกวันเช็กเอาต์หลังวันเช็กอิน"]
  B -- ใช่ --> C{"เช็กอิน = วันนี้ และเลย 20:00?<br/>US-02 §5"}
  C -- ใช่ --> E3["วันนี้ปิดรับจองแล้ว"]
  C -- ไม่ --> D{"เช็กอิน ≤ วันนี้ + 365 วัน<br/>และ ≤ 30 คืน? US-02"}
  D -- ไม่ --> E4["เกินช่วงที่จองได้ · 31 คืนขึ้นไปให้ติดต่อฝ่ายขาย"]
  D -- ใช่ --> P{"มีคืน Peak และพัก 1 คืน?<br/>US-13"}
  P -- ใช่ --> E5["ช่วงวันที่นี้ต้องพักอย่างน้อย 2 คืน"]
  P -- ไม่ --> L["วนทุกประเภทห้อง R01–R06"]
  L --> CAP{"ผู้ใหญ่ ≤ สูงสุด และรวมคน ≤ สูงสุด<br/>(นับเตียงเสริม R02 R05) US-01 ข้อ 2"}
  CAP -- ไม่ --> SKIP["ไม่แสดงห้องนี้"]
  CAP -- ใช่ --> AV{"ว่าง ≥ 1 ทุกคืน<br/>= ทั้งหมด − ขาย − ล็อก − ปิดซ่อม<br/>US-01 ข้อ 1 · US-03 · US-33 · US-51"}
  AV -- ไม่ --> SKIP
  AV -- ใช่ --> PR["คิดราคารายคืน + แผนราคาที่เข้าเงื่อนไข<br/>เรียงถูกไปแพง · flow-price<br/>US-05 US-11 US-12"]
  PR --> BADGE{"เหลือ ≤ 3 ห้อง?<br/>US-03 ข้อ 3"}
  BADGE -- ใช่ --> TAG["ป้าย เหลือ N ห้องสุดท้าย"] --> OUT
  BADGE -- ไม่ --> OUT["แสดงผลค้นหา"]
  SKIP --> NONE{"ไม่มีห้องเลย?"}
  NONE -- ใช่ --> SUG["ไม่มีห้องว่างในวันที่เลือก<br/>+ แนะนำช่วงใกล้สุด ±3 วัน US-01 ข้อ 5"]
```

### 3.2 จองและจ่ายเงิน

<!-- diagram: flow-booking -->
```mermaid
flowchart TD
  S([กด เลือกห้องและแผนราคา]) --> RE["คิดราคาใหม่ที่เซิร์ฟเวอร์<br/>ไม่เชื่อตัวเลขจากเบราว์เซอร์"]
  RE --> H{"ล็อกห้องได้ทุกคืน?<br/>row lock รายคืน US-33"}
  H -- ไม่ --> X1["ห้องนี้เพิ่งถูกจองไป · กลับหน้าค้นหา"]
  H -- ได้ --> HOLD["สร้างการจองสถานะ HELD<br/>hold_expires_at = ตอนนี้ + 15 นาที<br/>ห้องว่างของคนอื่นลด 1"]
  HOLD --> FORM["กรอกชื่อ อีเมล เบอร์โทร คำขอพิเศษ<br/>ใบกำกับภาษี · ความยินยอมการตลาด (ไม่ติ๊กไว้ก่อน)<br/>US-32 US-36 US-38 US-56"]
  FORM --> NR{"แผน Non-refundable?"}
  NR -- ใช่ --> ACK{"ติ๊กยอมรับ ไม่คืนเงิน?<br/>US-21 ข้อ 2"}
  ACK -- ไม่ --> FORM
  ACK -- ใช่ --> AMT["ยอดที่จ่าย = ยอดเต็ม"]
  NR -- ไม่ --> DEP["ยอดที่จ่าย = มัดจำ 30% ปัดลง<br/>ที่เหลือจ่ายที่โรงแรม §5 US-34"]
  AMT --> EXP
  DEP --> EXP{"ยังไม่หมดเวลาล็อก?"}
  EXP -- หมด --> X2["หมดเวลา 15 นาที ห้องคืนระบบ · เริ่มใหม่ US-33 ข้อ 2"]
  EXP -- ยัง --> PAY["จ่ายเงินจำลอง<br/>idempotency key = รหัสการจอง"]
  PAY --> OK{"สำเร็จ?"}
  OK -- ไม่ --> X3["จ่ายไม่สำเร็จ ไม่ตัดเงิน<br/>ยังอยู่ในเวลาล็อก ลองใหม่ได้ US-34 ข้อ 5"]
  X3 --> EXP
  OK -- ใช่ --> CONF["สถานะ CONFIRMED · ล็อกราคาทุกบรรทัด<br/>HELD → ขายแล้ว · ตัดสิทธิ์โค้ด Flash Sale เดือนเกิด"]
  CONF --> OUTB["outbox: อีเมลยืนยัน (ภาษาที่จอง)<br/>+ LINE แจ้งโรงแรม US-35 US-55"]
  OUTB --> DONE([หน้าสำเร็จ แสดงรหัสการจอง])
```

### 3.3 ยกเลิกและเปลี่ยนวัน

<!-- diagram: flow-cancel -->
```mermaid
flowchart TD
  S([เข้าจัดการการจอง]) --> ID{"สมาชิก login<br/>หรือ รหัสการจอง + อีเมลตรงกัน?<br/>US-41"}
  ID -- ไม่ --> CNT{"ผิดติดกัน 5 ครั้ง?"}
  CNT -- ใช่ --> LOCK["รอ 15 นาทีถึงลองใหม่ได้"]
  CNT -- ไม่ --> NF["ไม่พบการจอง (ไม่บอกว่าช่องไหนผิด)"]
  ID -- ใช่ --> DL["คำนวณเวลายกเลิกฟรี §6 US-39<br/>มีคืน Peak: 14:00 ของ 14 วันก่อนเช็กอิน<br/>ไม่มี: 14:00 ของ 3 วันก่อนเช็กอิน"]
  DL --> ACT{"ลูกค้าเลือก"}
  ACT -- ยกเลิก --> NRC{"Non-refundable?"}
  NRC -- ใช่ --> CF2["ยืนยันอีกครั้ง · คืน ฿0 US-39 ข้อ 4"]
  NRC -- ไม่ --> INT{"ตอนนี้ ≤ เวลายกเลิกฟรี?"}
  INT -- ใช่ --> R1["คืนมัดจำเต็ม · คืนสิทธิ์โค้ด แต้มที่แลก เดือนเกิด<br/>US-39 ข้อ 3, 6"]
  INT -- ไม่ --> R0["ไม่คืนมัดจำ"]
  R1 --> SHOW
  R0 --> SHOW
  CF2 --> SHOW["แสดงยอดที่จะได้คืนก่อนกดยืนยัน US-39 ข้อ 5"]
  SHOW --> CXL["สถานะ CANCELLED · ห้องกลับมาว่างทันที<br/>outbox อีเมล + LINE"]
  ACT -- เปลี่ยนวัน --> CH1{"แผนยกเลิกได้ และก่อนเวลายกเลิกฟรี?<br/>US-40 ข้อ 1, 4"}
  CH1 -- ไม่ --> NOCH["ไม่มีปุ่มเปลี่ยนวัน"]
  CH1 -- ใช่ --> CH2{"ห้องเดิมว่างทุกคืนในวันใหม่?"}
  CH2 -- ไม่ --> ALT["เปลี่ยนไม่ได้ · แนะนำห้องอื่นที่ว่าง"]
  CH2 -- ใช่ --> CH3["คิดราคาและโปรใหม่ตามวันใหม่<br/>ส่วนต่าง + จ่ายเพิ่ม / − คืนช่องทางเดิม US-40 ข้อ 2"]
  CH3 --> CH4["ย้ายจำนวนห้องรายคืนในธุรกรรมเดียว<br/>outbox แจ้งเปลี่ยนวัน"]
```

### 3.4 คำนวณราคาสุทธิตามลำดับของโรงแรม (§7)

<!-- diagram: flow-price -->
```mermaid
flowchart TD
  S([ห้อง วันที่ จำนวนคน แผน สถานะสมาชิก โค้ด]) --> N1["1 · ราคารายคืน<br/>ราคาเฉพาะวัน ถ้ามี US-52<br/>ไม่งั้นราคาตามซีซั่นของคืนนั้น US-11 US-12<br/>Peak ชนะ High US-15"]
  N1 --> N2["2 · โปรราคา PR-01 – PR-06 ที่เข้าเงื่อนไข<br/>คิดทุกตัว เลือก 1 ตัวที่ค่าห้องต่ำสุด US-16"]
  N2 --> PK{"มีคืน Peak?"}
  PK -- ใช่ --> PK2["ตัด Long Stay, Stay 4 Pay 3, Last Minute, Flash Sale<br/>เหลือ Early Bird เดือนเกิด §7"]
  PK -- ไม่ --> N3
  PK2 --> N3{"3 · Non-refundable?"}
  N3 -- ใช่ --> N3A["ค่าห้อง − 10% US-21"] --> N4
  N3 -- ไม่ --> N4{"4 · สมาชิกยืนยันอีเมลแล้ว และ login?"}
  N4 -- ใช่ --> N4A["ค่าห้อง − 5% US-22"] --> N5
  N4 -- ไม่ --> N5{"5 · มีโค้ด?"}
  N5 -- ใช่ --> N5B{"ใช้ได้? ไม่หมดอายุ · ไม่ครบสิทธิ์<br/>ค่าห้องหลังโปร ≥ ขั้นต่ำ US-23"}
  N5B -- ไม่ --> ERR["บอกเหตุผล เช่น ยอดขั้นต่ำ ฿3,000 (ขาดอีก ฿200)"] --> N6
  N5B -- ใช่ --> N5A["ค่าห้อง − ส่วนลดโค้ด ไม่ติดลบ"] --> N6
  N5 -- ไม่ --> N6["6 · บวกอาหารเช้า (ตามอายุ ณ วันเช็กอิน) เตียงเสริม<br/>ค่าแพ็กเกจ บริการเสริม · ส่วนลดข้อ 2–4 ไม่คิดกับส่วนนี้<br/>US-06 US-24 US-25 US-26 US-37"]
  N6 --> N7["7 · ปัดลงเป็นบาทเต็มครั้งเดียว §5"]
  N7 --> N8["มัดจำ = ปัดลง 30% ของยอด (แผนยกเลิกได้) US-34<br/>แต้มที่จะได้ = ปัดลง(ค่าห้องหลังส่วนลด / 100) US-43"]
  N8 --> OUT([บรรทัดราคา + ประหยัด ฿X + แยก VAT 7% ค่าบริการ 10% US-14])
```

ตัวอย่างตรวจลำดับ: R01 คืน 30 เม.ย. 2027 วันนี้ 1 มี.ค. 2027 · ฿2,400 → Early Bird 15% = ฿2,040 → Non-refundable 10% = ฿1,836 → สมาชิก 5% = ฿1,744.20 → ปัดลง **฿1,744** (US-17, US-21, US-22)

### 3.5 พนักงานกดเช็กเอาต์ และ No-show

<!-- diagram: flow-checkout -->
```mermaid
flowchart TD
  S([รายการแขกวันนี้ US-53]) --> T{"พนักงานกด"}
  T -- เช็กอิน --> CI["ใส่เลขห้องจริง (ห้องต้องไม่ปิดซ่อม และไม่มีแขกอยู่)<br/>สถานะ CHECKED_IN"]
  T -- เช็กเอาต์ --> CO["สถานะ CHECKED_OUT"]
  CO --> MEM{"ผู้จองเป็นสมาชิก?"}
  MEM -- ใช่ --> PT["เพิ่มแต้ม = ปัดลง(ค่าห้องหลังส่วนลด / 100)<br/>ไม่นับอาหารเช้า แพ็กเกจ บริการเสริม §8 US-43"]
  MEM -- ไม่ --> RV
  PT --> RV["เปิดสิทธิ์รีวิว 30 วัน US-47"]
  T -- No-show --> NS{"ตอนนี้ > 23:59 ของวันเช็กอิน?"}
  NS -- ไม่ --> NSX["ยังกด No-show ไม่ได้"]
  NS -- ใช่ --> NSY["สถานะ NO_SHOW · ไม่คืนมัดจำ<br/>คืนที่เหลือกลับมาว่าง · ไม่ได้แต้ม §6"]
```

---

## 4. ERD

<!-- diagram: erd -->
```mermaid
erDiagram
  room_types ||--o{ rooms : "มี"
  room_types ||--o{ season_rates : "ราคาตามซีซั่น"
  room_types ||--o{ date_rates : "ราคาเฉพาะวัน"
  room_types ||--o{ inventory_nights : "นับห้องรายคืน"
  room_types ||--o{ room_photos : "รูป"
  rooms ||--o{ room_closures : "ปิดซ่อม"
  seasons ||--o{ season_rates : "ใช้ราคา"
  users ||--o{ bookings : "จอง (สมาชิก)"
  users ||--o{ points_ledger : "แต้ม"
  users ||--o{ birthday_redemptions : "สิทธิ์เดือนเกิด"
  bookings ||--|{ booking_rooms : "ห้องในการจอง 1–5"
  booking_rooms ||--|{ booking_guests : "ผู้เข้าพัก"
  booking_rooms ||--|{ booking_nights : "ราคารายคืนที่ล็อก"
  room_types ||--o{ booking_rooms : "ประเภท"
  rooms |o--o{ booking_rooms : "เลขห้องตอนเช็กอิน"
  bookings ||--|{ booking_price_lines : "บรรทัดราคาที่ล็อก"
  bookings ||--o{ payments : "จ่าย / คืน"
  bookings ||--o{ booking_addons : "บริการเสริม"
  bookings |o--o| tax_invoice_requests : "ใบกำกับภาษี"
  bookings |o--o| reviews : "1 รีวิวต่อการจอง"
  reviews ||--o{ review_replies : "โรงแรมตอบ"
  promotions ||--o{ promo_codes : "โค้ด"
  promotions ||--o{ booking_promotions : "ใช้กับ"
  bookings ||--o{ booking_promotions : "โปรที่ใช้"
  staff_users ||--o{ audit_log : "ทำรายการ"

  room_types {
    text code PK "R01–R06"
    text name_th
    text name_en
    int size_sqm
    int max_adults
    int max_total
    boolean extra_bed_allowed "R02 R05"
    int total_rooms
    text pano_file "R03 R05 R06"
  }
  rooms {
    text room_no PK "101–110, V1"
    text room_type_code FK
  }
  room_closures {
    bigint id PK
    text room_no FK
    date from_date
    date to_date
    text reason
  }
  seasons {
    bigint id PK
    text kind "LOW HIGH PEAK"
    date start_date
    date end_date
  }
  season_rates {
    text room_type_code FK
    text kind
    numeric price "NUMERIC(12,2)"
  }
  date_rates {
    text room_type_code FK
    date night
    numeric price "NUMERIC(12,2)"
  }
  inventory_nights {
    text room_type_code PK
    date night PK
    int total
    int closed
    int sold
    int held
  }
  users {
    bigint id PK
    text email UK
    text display_name "แสดงใน dropdown"
    boolean email_verified
    date birth_date
    text lang "th en"
    boolean marketing_consent "default false"
    timestamptz deleted_at
  }
  bookings {
    text code PK "SJ-2027-000123"
    bigint user_id FK "null = guest"
    text contact_email
    text lang
    text plan "ROOM_ONLY BREAKFAST NONREF PACKAGE"
    text status "HELD CONFIRMED CHECKED_IN CHECKED_OUT CANCELLED NO_SHOW EXPIRED"
    timestamptz hold_expires_at
    date check_in
    date check_out
    numeric total "NUMERIC(12,2)"
    numeric paid "NUMERIC(12,2)"
    numeric due_at_hotel "NUMERIC(12,2)"
    timestamptz free_cancel_until
    int points_to_earn
    int points_redeemed
  }
  booking_rooms {
    bigint id PK
    text booking_code FK
    text room_type_code FK
    text room_no FK "เติมตอนเช็กอิน"
    boolean extra_bed
    text special_request "≤ 500 ตัวอักษร"
  }
  booking_guests {
    bigint id PK
    bigint booking_room_id FK
    text kind "ADULT CHILD"
    int age_at_checkin
  }
  booking_nights {
    bigint booking_room_id FK
    date night
    text season_kind
    numeric base_price "NUMERIC(12,2)"
  }
  booking_price_lines {
    bigint id PK
    text booking_code FK
    text kind "NIGHT PROMO NONREF MEMBER CODE BREAKFAST EXTRABED PACKAGE ADDON ROUNDING"
    text label
    numeric amount "NUMERIC(12,2) ลบ = ส่วนลด"
  }
  payments {
    bigint id PK
    text booking_code FK
    text method "CARD PROMPTPAY"
    text direction "CHARGE REFUND"
    numeric amount "NUMERIC(12,2)"
    text status "SUCCESS FAILED"
    text idempotency_key UK
  }
  promotions {
    text code PK "PR-01…"
    text grp "PRICE STACK PLAN"
    text kind "PERCENT AMOUNT FREE_NIGHT PACKAGE"
    numeric value
    jsonb rules "ล่วงหน้า คืนขั้นต่ำ ซีซั่น ห้อง blackout"
    int quota
    int used
    boolean member_only
    boolean active
  }
  promo_codes {
    text code PK "WELCOME500"
    text promotion_code FK
    numeric discount "NUMERIC(12,2)"
    numeric min_room_total "NUMERIC(12,2)"
    date valid_until
    int max_uses
    int used
  }
  booking_promotions {
    text booking_code FK
    text promotion_code FK
    numeric saved "NUMERIC(12,2)"
  }
  birthday_redemptions {
    bigint user_id FK
    int year
    text booking_code FK
  }
  points_ledger {
    bigint id PK
    bigint user_id FK
    int delta
    text reason "EARN REDEEM REFUND EXPIRE"
    text booking_code FK
  }
  booking_addons {
    bigint id PK
    text booking_code FK
    text kind "TRANSFER EARLY_IN LATE_OUT"
    numeric price "NUMERIC(12,2)"
    text status "PENDING CONFIRMED REJECTED"
    text flight_no
  }
  tax_invoice_requests {
    text booking_code FK
    text company
    text address
    text tax_id "13 หลัก"
    text branch
  }
  reviews {
    bigint id PK
    text booking_code FK
    int room_score
    int service_score
    int clean_score
    int location_score
    text body
  }
  review_replies {
    bigint review_id FK
    bigint staff_id FK
    text body
  }
  staff_users {
    bigint id PK
    text email UK
    text display_name
    text role "GM SALES FRONT ROOMS"
  }
  audit_log {
    bigint id PK
    bigint staff_id FK
    text action
    jsonb detail
  }
  room_photos {
    text room_type_code FK
    int sort
    text file
  }
```

ภาพ: `design/erd.png` · ตารางเสริมที่ไม่วาดเส้นเพื่อให้อ่านง่าย: `outbox_messages` (ช่องทาง ผู้รับ ภาษา หัวเรื่อง เนื้อหา เวลา) · `manage_attempts` (รหัสการจอง + IP นับครั้งผิด) · `fx_rates` (USD EUR CNY อัตราคงที่) · `app_settings` (`frozen_now`, `clock_offset`, `bug_mode`) · `chatbot_rules` · `content_i18n`

**ชนิดข้อมูล**: เงินทุกคอลัมน์ `NUMERIC(12,2)` ไม่ใช้ float · แต้ม `INTEGER` · วันเข้าพักเป็น `DATE` (คืนวันที่ X = คืนที่เริ่มวันที่ X) · เวลาเป็น `TIMESTAMPTZ`

### กลไกห้ามขายห้องเกิน (US-03, US-33, US-51)

1. **นับเป็นแถวรายคืน**: `inventory_nights(room_type_code, night)` มี `total` `closed` `sold` `held` และ `CHECK (sold + held + closed <= total)` เป็นด่านสุดท้ายในฐานข้อมูล
2. **ล็อกแถวตามลำดับเดียวกัน**: จองหรือล็อกห้องทำใน transaction เดียว `SELECT … FOR UPDATE` ทุกคืน **เรียงตามประเภทห้องแล้ววันที่** เพื่อไม่ให้ deadlock จากนั้นเพิ่ม `held` ถ้าคืนไหนเกิน CHECK ทั้ง transaction rollback และตอบ "ห้องนี้เพิ่งถูกจองไป"
3. **การล็อก 15 นาที**: HELD → CONFIRMED ย้ายจำนวนจาก `held` ไป `sold` ในแถวเดิม · หมดเวลาแล้วคืน `held` ด้วยการกวาดแบบ lazy ทุกครั้งที่ค้นหาหรือจอง (`hold_expires_at < clock.now()`) จึงทำงานกับนาฬิกาที่เลื่อนได้โดยไม่ต้องมี cron
4. **จ่ายเงิน**: เรียกจ่ายด้วย `idempotency_key = รหัสการจอง` และ `UNIQUE` ใน `payments` · กดจ่ายซ้ำได้ผลเดิม ไม่ตัดเงินสองครั้ง · ถ้าล็อกหมดอายุระหว่างจ่าย ระบบไม่เรียกจ่าย
5. **ปิดซ่อม**: เพิ่ม `closed` รายคืนได้เมื่อ `sold + held + closed + 1 <= total` เท่านั้น ถ้าเลขห้องนั้นมีการจองอยู่ (มี `room_no` ใน `booking_rooms` หรือห้องที่เหลือไม่พอ) ให้ตอบรหัสการจองที่ติดอยู่ (US-51 ข้อ 2)
6. **ราคาไม่เปลี่ยนย้อนหลัง**: ราคาและโปรทุกบรรทัดถูกคัดลอกลง `booking_nights` และ `booking_price_lines` ตอน CONFIRMED (US-15 ข้อ 4, US-30 ข้อ 2)

---

## 5. Sequence

### 5.1 ผู้เข้าพักจองและจ่ายเงิน

<!-- diagram: seq-booking -->
```mermaid
sequenceDiagram
  autonumber
  actor U as ผู้เข้าพัก (เบราว์เซอร์)
  participant W as hotel-web หน้าเว็บ
  participant A as hotel-web API
  participant R as lib/rules
  participant D as hotel-db
  participant S as บริการจำลอง

  U->>W: เลือก R02 1–4 ก.ค. 2027 · 2 ผู้ใหญ่ · รวมอาหารเช้า
  W->>A: POST /api/holds {room, dates, guests, plan, code}
  A->>R: คิดราคา (ซีซั่นรายคืน → โปร → … → ปัดเศษ)
  R-->>A: บรรทัดราคา + มัดจำ 30%
  A->>D: BEGIN · SELECT inventory_nights FOR UPDATE (เรียงวันที่)
  A->>D: UPDATE held = held + 1 · INSERT bookings HELD
  D-->>A: COMMIT
  A-->>W: รหัสการจอง + hold_expires_at + ราคา
  W-->>U: หน้ากรอกข้อมูล + นับถอยหลัง 15:00
  U->>W: กรอกข้อมูล + บัตร 4242 4242 4242 4242
  W->>A: POST /api/bookings/{code}/pay
  A->>D: ตรวจ HELD และยังไม่หมดเวลา
  A->>S: charge(มัดจำ, idempotency_key = code)
  S-->>A: SUCCESS
  A->>D: BEGIN · held − 1, sold + 1 · CONFIRMED · ล็อกบรรทัดราคา · ตัดสิทธิ์โค้ด
  A->>S: outbox อีเมลยืนยัน (ภาษาที่จอง) + LINE แจ้งโรงแรม
  D-->>A: COMMIT
  A-->>W: CONFIRMED
  W-->>U: หน้าสำเร็จ รหัสการจอง ยอดที่จ่าย ยอดที่โรงแรม เวลายกเลิกฟรี
```

### 5.2 ห้องสุดท้าย 2 คนกดพร้อมกัน

<!-- diagram: seq-race -->
```mermaid
sequenceDiagram
  autonumber
  actor P1 as คุณพลอย
  actor P2 as คุณแนน
  participant A as hotel-web API
  participant D as hotel-db

  Note over D: R06 คืน 24 ธ.ค. 2027 · total 2 · sold 1 · held 0 → เหลือ 1
  par กดพร้อมกัน
    P1->>A: POST /api/holds R06 23–25 ธ.ค.
    P2->>A: POST /api/holds R06 23–25 ธ.ค.
  end
  A->>D: [P1] BEGIN · SELECT … FOR UPDATE คืน 23, 24
  A->>D: [P2] BEGIN · SELECT … FOR UPDATE คืน 23 (รอ P1)
  A->>D: [P1] UPDATE held + 1 · COMMIT
  D-->>A: [P1] สำเร็จ
  A-->>P1: ล็อกได้ · นับถอยหลัง 15 นาที
  D-->>A: [P2] ได้ล็อกต่อ · เห็น sold 1 + held 1 = 2
  A->>D: [P2] UPDATE held + 1 → ชน CHECK · ROLLBACK
  A-->>P2: "ห้องนี้เพิ่งถูกจองไป" · ไม่มีการเรียกจ่ายเงิน ไม่ถูกตัดเงิน
  Note over P1,P2: จ่ายเงินเกิดหลังล็อกห้องได้เท่านั้น<br/>คนที่ไม่ได้ห้องจึงไม่มีทางถูกตัดเงิน (US-03 ข้อ 2)
```

### 5.3 ล็อกครบ 15 นาทีแล้วยังไม่จ่าย

<!-- diagram: seq-hold-expire -->
```mermaid
sequenceDiagram
  autonumber
  actor U as คุณต่อ
  actor O as คนอื่นค้นหา
  participant A as hotel-web API
  participant C as lib/clock
  participant D as hotel-db

  U->>A: POST /api/holds R01 คืนเดียว
  A->>D: held + 1 · hold_expires_at = 10:15
  O->>A: GET /api/search (10:05)
  A-->>O: R01 ว่างลดลง 1 (US-33 ข้อ 3)
  Note over C: เวลาผ่านไป หรือ test เรียก /api/test/clock {advanceMinutes: 15}
  U->>A: POST /api/bookings/{code}/pay (10:15:01)
  A->>C: now()
  C-->>A: 10:15:01
  A->>D: กวาด HELD ที่ hold_expires_at < now → EXPIRED · held − 1
  A-->>U: "หมดเวลา 15 นาที ห้องถูกปล่อยแล้ว กรุณาเริ่มใหม่" · ไม่เรียกจ่าย
  O->>A: GET /api/search
  A-->>O: R01 ว่างกลับมาเท่าเดิม
```

### 5.4 พนักงานกดเช็กเอาต์แล้วแต้มเข้า

<!-- diagram: seq-checkout -->
```mermaid
sequenceDiagram
  autonumber
  actor F as น้องมุก (FRONT)
  participant A as hotel-web API
  participant D as hotel-db
  actor N as คุณแนน (สมาชิก)

  F->>A: POST /api/admin/bookings/{code}/check-out
  A->>A: ตรวจบทบาท FRONT หรือ GM · สถานะ CHECKED_IN
  A->>D: BEGIN · status = CHECKED_OUT
  A->>D: อ่านบรรทัดราคา: ค่าห้องหลังส่วนลด ฿5,900
  A->>D: INSERT points_ledger +59 (ปัดลง 5,900 / 100) EARN
  A->>D: เปิดสิทธิ์รีวิวถึง เช็กเอาต์ + 30 วัน
  D-->>A: COMMIT
  A-->>F: เช็กเอาต์แล้ว · แต้ม +59
  N->>A: GET /api/me
  A-->>N: แต้มเดิม 250 + 59 = 309
```

---

## 6. คำถามที่ได้จากการออกแบบ

### ต้องถามโรงแรม

| # | เรื่อง | ทำไมสำคัญ | สมมติฐานที่ใช้ในแบบนี้ |
|---|---|---|---|
| Q-D1 | จองหลายห้องแล้วยกเลิกบางห้องได้ไหม (§11) | กระทบ `booking_rooms` และการคืนมัดจำ | ⚠️ ยกเลิกได้ทั้งการจองเท่านั้น |
| Q-D2 | เปลี่ยนวันได้กี่ครั้ง (§11) | ต้องนับครั้งไหม | ⚠️ ไม่จำกัด ตราบที่ยังก่อนเวลายกเลิกฟรี |
| Q-D3 | Gala Dinner 31 ธ.ค. (Q10, §11) | บรรทัดราคาภาคบังคับ | ⚠️ ยังไม่คิด เตรียม `kind = PACKAGE` ไว้ |
| Q-D4 | แต้มหมดอายุ (§11) | `points_ledger` ต้องมีวันหมดอายุไหม | ⚠️ เก็บ `expires_at` ไว้ แต่ยังไม่ตัด |
| Q-D5 | ใบกำกับภาษีออกเมื่อไร (Q15) | เก็บข้อมูลไว้ แต่การออกเอกสารยังไม่มี | ⚠️ รับข้อมูลตอนจอง ส่งหลังเช็กเอาต์ (นอกระบบ) |
| Q-D6 | เปลี่ยนวันแล้วราคาต่ำลง ต้องคืนมัดจำส่วนเกินหรือหักจากยอดที่โรงแรม | การคืนเงินทางช่องทางเดิม | ⚠️ ลดยอดที่ต้องจ่ายที่โรงแรมก่อน เกินจากนั้นจึงคืน |
| Q-D7 | Flash Sale กับ Non-refundable ซ้อนกันได้ไหม | Flash Sale เป็นโปรราคา | ⚠️ ได้ ตามลำดับ §7 |

### ทีมตัดสินใจเอง

| # | เรื่อง | ตัดสินใจ |
|---|---|---|
| D-01 | ปล่อยห้องที่หมดเวลาล็อก | กวาดแบบ lazy ตอนค้นหาหรือจอง ไม่ใช้ cron เพื่อให้ทำงานกับนาฬิกาที่เลื่อนได้ |
| D-02 | ราคาบนจอ | เบราว์เซอร์แสดงอย่างเดียว เซิร์ฟเวอร์คิดใหม่ทุกครั้งก่อนล็อกและก่อนจ่าย |
| D-03 | รหัสการจอง | `SJ-ปี-เลข 6 หลัก` ไม่เรียงต่อเนื่องจนเดาได้ (ใช้เลขสุ่ม) เพราะใช้เข้าดูการจองคู่กับอีเมล |
| D-04 | อายุเด็ก | เก็บ `age_at_checkin` ตอนจอง ไม่คิดใหม่ภายหลัง (§4) |
| D-05 | ห้องที่ปิดซ่อม | ปิดเป็นเลขห้อง แต่หักออกจากจำนวนรายคืนของประเภทห้อง |
| D-06 | อีเมลและ LINE | เขียนลง `outbox_messages` ใน transaction เดียวกับการเปลี่ยนสถานะ จึงไม่มีอีเมลยืนยันสำหรับการจองที่ไม่สำเร็จ |
| D-07 | ลบบัญชี (US-56) | ลบข้อมูลส่วนตัวใน `users` แต่เก็บ `bookings` และ `tax_invoice_requests` ไว้ตามกฎหมาย โดยตัดการเชื่อมกับตัวบุคคล |
| D-08 | สิทธิ์หลังบ้าน | ตรวจบทบาทที่ API ทุกเส้น ไม่พึ่งการซ่อนเมนู |
