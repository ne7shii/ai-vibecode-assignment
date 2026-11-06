-- CWN สบายจัง รีสอร์ท · schema ตาม DESIGN.md §4
-- เงินทุกคอลัมน์ NUMERIC(12,2) · แต้ม INTEGER · คืนวันที่ X = คืนที่เริ่มวันที่ X

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TABLE app_settings (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  frozen_now    timestamptz,             -- null = เวลาจริง
  clock_offset_ms bigint NOT NULL DEFAULT 0,
  anchor_real   timestamptz NOT NULL DEFAULT now(), -- real time when frozen_now was set (ticking demo clock)
  bug_mode      int NOT NULL DEFAULT 0
);

CREATE TABLE room_types (
  code              text PRIMARY KEY,
  name_th           text NOT NULL,
  name_en           text NOT NULL,
  desc_th           text NOT NULL DEFAULT '',
  desc_en           text NOT NULL DEFAULT '',
  size_sqm          int  NOT NULL,
  bed_th            text NOT NULL,
  bed_en            text NOT NULL,
  view_th           text NOT NULL,
  view_en           text NOT NULL,
  max_adults        int  NOT NULL,
  max_total         int  NOT NULL,
  extra_bed_allowed boolean NOT NULL DEFAULT false,
  total_rooms       int  NOT NULL CHECK (total_rooms > 0),
  amenities         text[] NOT NULL DEFAULT '{}',
  pano_file         text,
  sort              int NOT NULL
);

CREATE TABLE room_photos (
  room_type_code text NOT NULL REFERENCES room_types(code),
  sort           int  NOT NULL,
  file           text NOT NULL,
  caption_th     text NOT NULL DEFAULT '',
  caption_en     text NOT NULL DEFAULT '',
  PRIMARY KEY (room_type_code, sort)
);

CREATE TABLE rooms (
  room_no        text PRIMARY KEY,
  room_type_code text NOT NULL REFERENCES room_types(code)
);

CREATE TABLE room_closures (
  id         bigserial PRIMARY KEY,
  room_no    text NOT NULL REFERENCES rooms(room_no),
  from_date  date NOT NULL,
  to_date    date NOT NULL,             -- รวมวันสุดท้าย
  reason     text NOT NULL DEFAULT '',
  CHECK (to_date >= from_date)
);

CREATE TABLE seasons (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('LOW','HIGH','PEAK')),
  start_date date NOT NULL,
  end_date   date NOT NULL,             -- รวมวันสุดท้าย
  label      text NOT NULL DEFAULT '',
  CHECK (end_date >= start_date)
);

CREATE TABLE season_rates (
  room_type_code text NOT NULL REFERENCES room_types(code),
  kind           text NOT NULL CHECK (kind IN ('LOW','HIGH','PEAK')),
  price          numeric(12,2) NOT NULL CHECK (price > 0),
  PRIMARY KEY (room_type_code, kind)
);

CREATE TABLE date_rates (
  room_type_code text NOT NULL REFERENCES room_types(code),
  night          date NOT NULL,
  price          numeric(12,2) NOT NULL CHECK (price > 0),
  PRIMARY KEY (room_type_code, night)
);

-- กลไกห้ามขายห้องเกิน (DESIGN §4)
CREATE TABLE inventory_nights (
  room_type_code text NOT NULL REFERENCES room_types(code),
  night          date NOT NULL,
  total          int NOT NULL,
  closed         int NOT NULL DEFAULT 0,
  sold           int NOT NULL DEFAULT 0,
  held           int NOT NULL DEFAULT 0,
  PRIMARY KEY (room_type_code, night),
  CONSTRAINT no_oversell CHECK (sold + held + closed <= total AND sold >= 0 AND held >= 0 AND closed >= 0)
);

CREATE TABLE users (
  id                bigserial PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  display_name      text NOT NULL,
  phone             text NOT NULL DEFAULT '',
  email_verified    boolean NOT NULL DEFAULT false,
  verify_token      text,
  birth_date        date,
  lang              text NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en')),
  marketing_consent boolean NOT NULL DEFAULT false,
  photo             text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_users (
  id           bigserial PRIMARY KEY,
  email        text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role         text NOT NULL CHECK (role IN ('GM','SALES','FRONT','ROOMS')),
  photo        text
);

CREATE TABLE promotions (
  code          text PRIMARY KEY,
  grp           text NOT NULL CHECK (grp IN ('PRICE','STACK','PLAN')),
  kind          text NOT NULL,
  name_th       text NOT NULL,
  name_en       text NOT NULL,
  desc_th       text NOT NULL DEFAULT '',
  desc_en       text NOT NULL DEFAULT '',
  value         numeric(12,2) NOT NULL DEFAULT 0,
  rules         jsonb NOT NULL DEFAULT '{}',
  quota         int,
  used          int NOT NULL DEFAULT 0,
  member_only   boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  image         text,
  sort          int NOT NULL DEFAULT 100,
  CHECK (quota IS NULL OR used <= quota)
);

CREATE TABLE promo_codes (
  code           text PRIMARY KEY,
  discount       numeric(12,2) NOT NULL CHECK (discount > 0),
  min_room_total numeric(12,2) NOT NULL DEFAULT 0,
  valid_until    date NOT NULL,
  max_uses       int,
  used           int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  CHECK (max_uses IS NULL OR used <= max_uses)
);

CREATE TABLE bookings (
  code              text PRIMARY KEY,
  user_id           bigint REFERENCES users(id),
  contact_name      text NOT NULL DEFAULT '',
  contact_email     text NOT NULL DEFAULT '',
  contact_phone     text NOT NULL DEFAULT '',
  lang              text NOT NULL DEFAULT 'th',
  plan              text NOT NULL CHECK (plan IN ('ROOM_ONLY','BREAKFAST','GREEN','HONEYMOON','FESTIVAL')),
  nonref            boolean NOT NULL DEFAULT false,
  festival_code     text,
  priced_at         timestamptz NOT NULL DEFAULT now(),           -- เวลาที่ใช้ตัดสินสิทธิ์โปร (เวลาล็อกห้อง)
  status            text NOT NULL CHECK (status IN ('HELD','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW','EXPIRED')),
  hold_token        text NOT NULL,
  hold_expires_at   timestamptz,
  check_in          date NOT NULL,
  check_out         date NOT NULL,
  has_peak          boolean NOT NULL DEFAULT false,
  total             numeric(12,2) NOT NULL,
  room_total        numeric(12,2) NOT NULL,            -- ค่าห้องหลังส่วนลด (ใช้คิดแต้ม)
  deposit           numeric(12,2) NOT NULL,
  paid              numeric(12,2) NOT NULL DEFAULT 0,
  refunded          numeric(12,2) NOT NULL DEFAULT 0,
  due_at_hotel      numeric(12,2) NOT NULL DEFAULT 0,
  free_cancel_until timestamptz,
  promo_code        text REFERENCES promo_codes(code),
  code_error        jsonb,                            -- last promo-code error shown in step 3
  points_to_earn    int NOT NULL DEFAULT 0,
  points_redeemed   int NOT NULL DEFAULT 0,
  points_earned     int NOT NULL DEFAULT 0,
  birthday_used     boolean NOT NULL DEFAULT false,
  flash_promo       text,
  dinner_night      date,
  arrival_time      text,
  marketing_consent boolean NOT NULL DEFAULT false,
  nonref_ack        boolean NOT NULL DEFAULT false,
  arrival_notes     text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL,
  confirmed_at      timestamptz,
  cancelled_at      timestamptz,
  CHECK (check_out > check_in)
);
CREATE INDEX bookings_user_idx ON bookings(user_id);
CREATE INDEX bookings_checkin_idx ON bookings(check_in);

CREATE TABLE booking_rooms (
  id               bigserial PRIMARY KEY,
  booking_code     text NOT NULL REFERENCES bookings(code) ON DELETE CASCADE,
  room_type_code   text NOT NULL REFERENCES room_types(code),
  room_no          text REFERENCES rooms(room_no),
  adults           int NOT NULL CHECK (adults >= 1),
  extra_bed        boolean NOT NULL DEFAULT false,
  bed_pref         text,
  high_floor       boolean NOT NULL DEFAULT false,
  special_request  text NOT NULL DEFAULT '' CHECK (char_length(special_request) <= 500)
);

CREATE TABLE booking_guests (
  id              bigserial PRIMARY KEY,
  booking_room_id bigint NOT NULL REFERENCES booking_rooms(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('ADULT','CHILD')),
  age_at_checkin  int
);

CREATE TABLE booking_nights (
  booking_room_id bigint NOT NULL REFERENCES booking_rooms(id) ON DELETE CASCADE,
  night           date NOT NULL,
  season_kind     text NOT NULL,
  base_price      numeric(12,2) NOT NULL,
  PRIMARY KEY (booking_room_id, night)
);

CREATE TABLE booking_price_lines (
  id           bigserial PRIMARY KEY,
  booking_code text NOT NULL REFERENCES bookings(code) ON DELETE CASCADE,
  sort         int NOT NULL,
  kind         text NOT NULL,
  label_th     text NOT NULL,
  label_en     text NOT NULL,
  amount       numeric(12,2) NOT NULL
);

CREATE TABLE booking_promotions (
  booking_code   text NOT NULL REFERENCES bookings(code) ON DELETE CASCADE,
  promotion_code text NOT NULL,
  saved          numeric(12,2) NOT NULL,
  PRIMARY KEY (booking_code, promotion_code)
);

CREATE TABLE payments (
  id              bigserial PRIMARY KEY,
  booking_code    text NOT NULL REFERENCES bookings(code),
  method          text NOT NULL CHECK (method IN ('CARD','PROMPTPAY')),
  direction       text NOT NULL CHECK (direction IN ('CHARGE','REFUND')),
  amount          numeric(12,2) NOT NULL,
  status          text NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  card_last4      text,
  idempotency_key text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL
);

CREATE TABLE booking_addons (
  id           bigserial PRIMARY KEY,
  booking_code text NOT NULL REFERENCES bookings(code) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('TRANSFER','VAN','EARLY_IN','LATE_OUT')),
  price        numeric(12,2) NOT NULL,
  status       text NOT NULL CHECK (status IN ('PENDING','CONFIRMED','REJECTED')),
  flight_no    text,
  arrive_time  text
);

CREATE TABLE tax_invoice_requests (
  booking_code text PRIMARY KEY REFERENCES bookings(code) ON DELETE CASCADE,
  company      text NOT NULL,
  address      text NOT NULL,
  tax_id       text NOT NULL CHECK (tax_id ~ '^[0-9]{13}$'),
  branch       text NOT NULL
);

CREATE TABLE birthday_redemptions (
  user_id      bigint NOT NULL REFERENCES users(id),
  year         int NOT NULL,
  booking_code text NOT NULL,
  PRIMARY KEY (user_id, year)
);

CREATE TABLE points_ledger (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id),
  delta        int NOT NULL,
  reason       text NOT NULL CHECK (reason IN ('EARN','REDEEM','REFUND','SEED')),
  booking_code text,
  created_at   timestamptz NOT NULL
);

CREATE TABLE reviews (
  id             bigserial PRIMARY KEY,
  booking_code   text NOT NULL UNIQUE REFERENCES bookings(code),
  room_type_code text NOT NULL,
  author_name    text NOT NULL,
  author_photo   text,
  room_score     int NOT NULL CHECK (room_score BETWEEN 1 AND 5),
  service_score  int NOT NULL CHECK (service_score BETWEEN 1 AND 5),
  clean_score    int NOT NULL CHECK (clean_score BETWEEN 1 AND 5),
  location_score int NOT NULL CHECK (location_score BETWEEN 1 AND 5),
  body           text NOT NULL,
  lang           text NOT NULL DEFAULT 'th',
  created_at     timestamptz NOT NULL
);

CREATE TABLE review_replies (
  review_id  bigint PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  staff_id   bigint NOT NULL REFERENCES staff_users(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE outbox_messages (
  id           bigserial PRIMARY KEY,
  channel      text NOT NULL CHECK (channel IN ('EMAIL','LINE')),
  recipient    text NOT NULL,
  lang         text NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  booking_code text,
  event        text NOT NULL,
  created_at   timestamptz NOT NULL
);

CREATE TABLE manage_attempts (
  key        text PRIMARY KEY,               -- รหัสการจองที่ลอง (ตัวพิมพ์ใหญ่)
  fails      int NOT NULL DEFAULT 0,
  locked_until timestamptz
);

CREATE TABLE group_quote_requests (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL,
  rooms      int NOT NULL,
  check_in   date,
  check_out  date,
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL
);

CREATE TABLE fx_rates (
  currency text PRIMARY KEY,
  thb_per_unit numeric(12,4) NOT NULL
);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  staff_id   bigint REFERENCES staff_users(id),
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL
);
