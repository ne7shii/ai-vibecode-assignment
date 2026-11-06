-- Back office (agent admin) · additive only
-- สิ่งอำนวยความสะดวกภาษาอังกฤษ (US-51 ข้อ 3 แก้ได้ทุกภาษา) · คอลัมน์เดิม amenities เก็บภาษาไทย
ALTER TABLE room_types ADD COLUMN IF NOT EXISTS amenities_en text[] NOT NULL DEFAULT '{}';

UPDATE room_types rt SET amenities_en = ARRAY(
  SELECT CASE a
    WHEN 'แอร์' THEN 'Air conditioning'
    WHEN 'ทีวี' THEN 'TV'
    WHEN 'ตู้เย็น' THEN 'Fridge'
    WHEN 'ตู้เซฟ' THEN 'Safe'
    WHEN 'เครื่องชงกาแฟ' THEN 'Coffee maker'
    WHEN 'ไดร์เป่าผม' THEN 'Hair dryer'
    WHEN 'ระเบียง' THEN 'Balcony'
    WHEN 'อ่างอาบน้ำ' THEN 'Bathtub'
    WHEN 'มุมนั่งเล่น' THEN 'Sitting area'
    WHEN 'ห้องนั่งเล่น' THEN 'Living room'
    WHEN 'สระส่วนตัว' THEN 'Private pool'
    WHEN 'ศาลา' THEN 'Sala'
    ELSE a END
  FROM unnest(rt.amenities) WITH ORDINALITY AS t(a, i) ORDER BY i
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS booking_addons_status_idx ON booking_addons (status);
