-- ข้อมูลตั้งต้นตาม interview/OWNER-ANSWERS.md · ⚠️ = ทีมตั้งเอง
-- "วันนี้" ของเว็บสาธิต = 2027-03-01 10:00 (+07:00) ตรงกับตัวอย่าง US-17

INSERT INTO app_settings (id, frozen_now, clock_offset_ms, bug_mode)
VALUES (1, '2027-03-01T10:00:00+07:00', 0, 0);

-- §2 ห้องพัก
INSERT INTO room_types (code,name_th,name_en,desc_th,desc_en,size_sqm,bed_th,bed_en,view_th,view_en,max_adults,max_total,extra_bed_allowed,total_rooms,amenities,pano_file,sort) VALUES
('R01','ซุพีเรียร์','Superior','ห้องพักกะทัดรัด ตกแต่งไม้อบอุ่น เหมาะกับคู่รักหรือเดินทางคนเดียว','Cosy room with warm timber details, ideal for couples or solo travellers',28,'คิง 1 เตียง หรือ ทวิน 2 เตียง','1 King or 2 Twin','สวน / ลานจอดรถ','Garden / car park',2,3,false,20,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม}',NULL,1),
('R02','ดีลักซ์ การ์เด้นวิว','Deluxe Garden View','ระเบียงมองสวนเขตร้อน เพิ่มเตียงเสริมได้ 1 เตียง','Balcony over the tropical garden, one extra bed available',34,'คิง 1 เตียง หรือ ทวิน 2 เตียง','1 King or 2 Twin','สวนเขตร้อน','Tropical garden',2,3,true,15,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม,ระเบียง}',NULL,2),
('R03','ดีลักซ์ พูลแอคเซส','Deluxe Pool Access','ก้าวจากระเบียงลงสระได้ทันที','Step straight from your terrace into the pool',36,'คิง 1 เตียง','1 King','ลงสระจากระเบียง','Direct pool access',2,3,false,6,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม,อ่างอาบน้ำ}','/brand/pano/pano-r03.jpg',3),
('R04','แฟมิลี่รูม','Family Room','ห้องกว้างสำหรับครอบครัว มีเตียงสองชั้นสำหรับเด็ก','Spacious family room with a bunk bed for kids',48,'คิง 1 เตียง + เตียงสองชั้น','1 King + bunk bed','สระว่ายน้ำ','Pool',3,5,false,5,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม,มุมนั่งเล่น}',NULL,4),
('R05','จูเนียร์ สวีท','Junior Suite','ห้องนั่งเล่นแยก วิวทะเลอันดามัน เพิ่มเตียงเสริมได้ 1 เตียง','Separate lounge with Andaman sea views, one extra bed available',60,'คิง 1 เตียง + โซฟาเบด','1 King + sofa bed','ทะเล','Sea view',3,4,true,3,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม,อ่างอาบน้ำ,ห้องนั่งเล่น}','/brand/pano/pano-r05.jpg',5),
('R06','พูลวิลล่า','Pool Villa','วิลล่าส่วนตัวพร้อมสระ ศาลา และห้องน้ำกลางแจ้ง','Private villa with pool, sala and open-air bathroom',90,'คิง 2 เตียง','2 King','สระส่วนตัว','Private pool',4,6,false,2,'{แอร์,ทีวี,ตู้เย็น,ตู้เซฟ,เครื่องชงกาแฟ,ไดร์เป่าผม,อ่างอาบน้ำ,สระส่วนตัว,ห้องนั่งเล่น,ศาลา}','/brand/pano/pano-r06.jpg',6);

INSERT INTO room_photos (room_type_code, sort, file, caption_th, caption_en) VALUES
('R01',1,'/brand/rooms/r01-1-bed.jpg','ห้องนอน','Bedroom'),('R01',2,'/brand/rooms/r01-2-bath.jpg','ห้องน้ำ','Bathroom'),('R01',3,'/brand/rooms/r01-3-view.jpg','วิว','View'),('R01',4,'/brand/rooms/r01-4-desk.jpg','มุมทำงาน','Desk'),('R01',5,'/brand/rooms/r01-5-detail.jpg','รายละเอียด','Detail'),
('R02',1,'/brand/rooms/r02-1-bed.jpg','ห้องนอน','Bedroom'),('R02',2,'/brand/rooms/r02-2-bath.jpg','ห้องน้ำ','Bathroom'),('R02',3,'/brand/rooms/r02-3-garden.jpg','สวน','Garden'),('R02',4,'/brand/rooms/r02-4-balcony.jpg','วิวจากระเบียง','Balcony view'),('R02',5,'/brand/rooms/r02-5-extrabed.jpg','แบบทวิน','Twin setup'),
('R03',1,'/brand/rooms/r03-1-bed.jpg','ห้องนอน','Bedroom'),('R03',2,'/brand/rooms/r03-2-pool.jpg','สระหน้าห้อง','Pool access'),('R03',3,'/brand/rooms/r03-3-terrace.jpg','ระเบียง','Terrace'),('R03',4,'/brand/rooms/r03-4-bath.jpg','ห้องน้ำ','Bathroom'),('R03',5,'/brand/rooms/r03-5-detail.jpg','รายละเอียด','Detail'),
('R04',1,'/brand/rooms/r04-1-beds.jpg','ห้องนอน','Bedroom'),('R04',2,'/brand/rooms/r04-2-kids.jpg','มุมเด็ก','Kids corner'),('R04',3,'/brand/rooms/r04-3-living.jpg','มุมนั่งเล่น','Living'),('R04',4,'/brand/rooms/r04-4-bath.jpg','ห้องน้ำ','Bathroom'),('R04',5,'/brand/rooms/r04-5-view.jpg','วิวสระ','Pool view'),
('R05',1,'/brand/rooms/r05-1-bed.jpg','ห้องนอน','Bedroom'),('R05',2,'/brand/rooms/r05-2-living.jpg','ห้องนั่งเล่น','Lounge'),('R05',3,'/brand/rooms/r05-3-bath.jpg','ห้องน้ำ','Bathroom'),('R05',4,'/brand/rooms/r05-4-balcony.jpg','วิวทะเล','Sea view'),('R05',5,'/brand/rooms/r05-5-detail.jpg','รายละเอียด','Detail'),
('R06',1,'/brand/rooms/r06-1-pool.jpg','สระส่วนตัว','Private pool'),('R06',2,'/brand/rooms/r06-2-bed.jpg','ห้องนอน','Bedroom'),('R06',3,'/brand/rooms/r06-3-sala.jpg','ศาลา','Sala'),('R06',4,'/brand/rooms/r06-4-bath.jpg','ห้องน้ำกลางแจ้ง','Open-air bath'),('R06',5,'/brand/rooms/r06-5-living.jpg','ห้องนั่งเล่น','Living');

INSERT INTO rooms (room_no, room_type_code)
SELECT n::text, 'R01' FROM generate_series(101,110) n UNION ALL
SELECT n::text, 'R01' FROM generate_series(201,210) n UNION ALL
SELECT n::text, 'R02' FROM generate_series(111,115) n UNION ALL
SELECT n::text, 'R02' FROM generate_series(211,215) n UNION ALL
SELECT n::text, 'R02' FROM generate_series(311,315) n UNION ALL
SELECT n::text, 'R03' FROM generate_series(301,306) n UNION ALL
SELECT n::text, 'R04' FROM generate_series(401,405) n UNION ALL
SELECT n::text, 'R05' FROM generate_series(501,503) n UNION ALL
SELECT 'V1','R06' UNION ALL SELECT 'V2','R06';

-- §3 ซีซั่น (Peak ชนะ High · US-15 ข้อ 2) · ตรุษจีน 2028 ⚠️
INSERT INTO seasons (kind, start_date, end_date, label) VALUES
('HIGH','2026-11-01','2027-04-30','High 2026/27'),
('PEAK','2026-12-20','2027-01-05','ปีใหม่ 2027'),
('PEAK','2027-02-05','2027-02-08','ตรุษจีน 2027'),
('PEAK','2027-04-11','2027-04-16','สงกรานต์ 2027'),
('LOW', '2027-05-01','2027-10-31','Green Season 2027'),
('HIGH','2027-11-01','2028-04-30','High 2027/28'),
('PEAK','2027-12-20','2028-01-05','ปีใหม่ 2028'),
('PEAK','2028-01-25','2028-01-28','ตรุษจีน 2028 ⚠️'),
('PEAK','2028-04-11','2028-04-16','สงกรานต์ 2028'),
('LOW', '2028-05-01','2028-10-31','Green Season 2028'),
('HIGH','2028-11-01','2029-04-30','High 2028/29'),
('PEAK','2028-12-20','2029-01-05','ปีใหม่ 2029');

INSERT INTO season_rates (room_type_code, kind, price) VALUES
('R01','LOW',1800),('R01','HIGH',2400),('R01','PEAK',3200),
('R02','LOW',2400),('R02','HIGH',3200),('R02','PEAK',4200),
('R03','LOW',3500),('R03','HIGH',4600),('R03','PEAK',6000),
('R04','LOW',3800),('R04','HIGH',5000),('R04','PEAK',6500),
('R05','LOW',5000),('R05','HIGH',6500),('R05','PEAK',8500),
('R06','LOW',8000),('R06','HIGH',10500),('R06','PEAK',14000);

INSERT INTO date_rates (room_type_code, night, price) VALUES ('R01','2027-02-14',2900);

INSERT INTO inventory_nights (room_type_code, night, total)
SELECT rt.code, d::date, rt.total_rooms
FROM room_types rt CROSS JOIN generate_series('2026-11-01'::date, '2029-04-30'::date, interval '1 day') d;

-- §7 โปรโมชั่น
INSERT INTO promotions (code, grp, kind, name_th, name_en, desc_th, desc_en, value, rules, quota, used, member_only, image, sort) VALUES
('PR-01','PRICE','PERCENT','เอิร์ลี่เบิร์ด','Early Bird','จองล่วงหน้า 60 วันขึ้นไป ลด 15% ใช้ได้ทุกซีซั่น','Book 60+ days ahead and save 15%, all seasons',15,'{"minLeadDays":60}',NULL,0,false,'/brand/resort/hero-sunset.jpg',1),
('PR-02','PRICE','PERCENT','ลาสต์มินิต','Last Minute','จองก่อนเข้าพักไม่เกิน 3 วัน ช่วง Green Season ลด 10%','Book within 3 days of arrival in Green Season, save 10%',10,'{"maxLeadDays":3,"allSeasons":["LOW"],"noPeak":true}',NULL,0,false,'/brand/misc/rain-green.jpg',2),
('PR-03','PRICE','FREE_NIGHT','พัก 4 จ่าย 3','Stay 4 Pay 3','ทุก 4 คืนฟรี 1 คืน (คืนที่ถูกที่สุด) ไม่รวมช่วง Peak','Every 4th night free (cheapest night), not in Peak',4,'{"every":4,"noPeak":true}',NULL,0,false,'/brand/resort/pool-main.jpg',3),
('PR-04','PRICE','PERCENT','ลองสเตย์','Long Stay','พัก 7 คืนขึ้นไป ลด 20% ไม่รวมช่วง Peak','Stay 7+ nights and save 20%, not in Peak',20,'{"minNights":7,"noPeak":true}',NULL,0,false,'/brand/resort/coworking.jpg',4),
('PR-05','PRICE','PERCENT','ส่วนลดเดือนเกิด','Birthday Month','สมาชิกพักในเดือนเกิด ลด 15% ปีละ 1 ครั้ง พร้อมเค้กในห้อง','Members save 15% in their birthday month, once a year, with a cake',15,'{"birthday":true}',NULL,0,true,'/brand/resort/birthday-cake.jpg',5),
('PR-06','PRICE','PERCENT','แฟลชเซล ดีลักซ์ การ์เด้นวิว','Flash Sale Deluxe Garden View','ลด 30% ห้อง Deluxe Garden View เข้าพัก พ.ค.–ก.ย. 2027 จำนวนจำกัด 10 ห้อง','30% off Deluxe Garden View for May–Sep 2027 stays, 10 rooms only',30,'{"roomTypes":["R02"],"saleFrom":"2027-02-28T12:00:00+07:00","saleTo":"2027-03-02T12:00:00+07:00","stayFrom":"2027-05-01","stayTo":"2027-09-30","noPeak":true,"flash":true}',10,3,false,'/brand/rooms/r02-1-bed.jpg',6),
('PR-07','STACK','PERCENT','ราคาไม่คืนเงิน','Non-refundable','ลดเพิ่ม 10% จ่ายเต็ม ยกเลิกไม่คืนเงิน','Extra 10% off, pay in full, no refund',10,'{}',NULL,0,false,NULL,7),
('PR-08','STACK','PERCENT','ราคาสมาชิก','Member Deal','สมาชิกที่ยืนยันอีเมลแล้วลดเพิ่ม 5%','Verified members save an extra 5%',5,'{}',NULL,0,true,NULL,8),
('PR-10','PLAN','GREEN','กรีนซีซั่น เกตอะเวย์','Green Season Getaway','ช่วง Green Season พัก 2 คืนขึ้นไป รวมอาหารเช้า 2 ท่าน และ Late check-out 15:00 · อัปเกรดห้องถ้ามีห้องว่าง (ไม่รับประกัน)','Green Season, 2+ nights: breakfast for 2 and 15:00 late check-out · upgrade if available (not guaranteed)',0,'{"allSeasons":["LOW"],"minNights":2}',NULL,0,false,'/brand/misc/rain-green.jpg',10),
('PR-11','PLAN','HONEYMOON','ฮันนีมูน','Honeymoon','ห้อง Pool Access หรือ Pool Villa พัก 2 คืนขึ้นไป จองล่วงหน้า 3 วัน +฿2,500 ดินเนอร์ริมสระ ตกแต่งเตียง ไวน์ 1 ขวด','Pool Access or Pool Villa, 2+ nights, 3 days ahead, +฿2,500: poolside dinner, bed decoration, wine',2500,'{"roomTypes":["R03","R06"],"minNights":2,"minLeadDays":3}',NULL,0,false,'/brand/resort/honeymoon-dinner.jpg',11),
('PR-12','PLAN','FAMILY_SUMMER','แฟมิลี่ซัมเมอร์','Family Summer','เข้าพัก 15 มี.ค. – 15 พ.ค. แผนรวมอาหารเช้า เด็กกินฟรี พร้อมกิจกรรม Kids Club','Stay 15 Mar – 15 May with breakfast: kids eat free, plus Kids Club activities',0,'{"stayFrom":"2027-03-15","stayTo":"2027-05-15"}',NULL,0,false,'/brand/resort/kids-club.jpg',12),
('PR-13A','PLAN','FESTIVAL','แพ็กเกจสงกรานต์','Songkran Package','เข้าพักช่วง 11–16 เม.ย. 2027 +฿1,500 ต่อการจอง: ชุดเล่นน้ำ ดินเนอร์ไทย ⚠️','Stay 11–16 Apr 2027, +฿1,500 per booking: water-fight kit and Thai dinner ⚠️',1500,'{"stayFrom":"2027-04-11","stayTo":"2027-04-16"}',NULL,0,false,'/brand/events/songkran.jpg',13),
('PR-13B','PLAN','FESTIVAL','แพ็กเกจลอยกระทง','Loy Krathong Package','เข้าพักช่วง 12–14 พ.ย. 2027 +฿1,200 ต่อการจอง: กระทงใบตอง ดินเนอร์ริมหาด ⚠️','Stay 12–14 Nov 2027, +฿1,200 per booking: banana-leaf krathong and beach dinner ⚠️',1200,'{"stayFrom":"2027-11-12","stayTo":"2027-11-14"}',NULL,0,false,'/brand/events/loy-krathong.jpg',14),
('PR-13C','PLAN','FESTIVAL','แพ็กเกจเคานต์ดาวน์','Countdown Package','เข้าพักคืน 31 ธ.ค. 2027 +฿4,000 ต่อการจอง: ปาร์ตี้ริมหาดและพลุ ⚠️ (Gala Dinner รอโรงแรมยืนยัน)','Stay 31 Dec 2027, +฿4,000 per booking: beach party and fireworks ⚠️ (Gala Dinner awaiting confirmation)',4000,'{"stayFrom":"2027-12-31","stayTo":"2027-12-31"}',NULL,0,false,'/brand/events/countdown.jpg',15);

INSERT INTO promo_codes (code, discount, min_room_total, valid_until, max_uses, used) VALUES
('WELCOME500',500,3000,'2027-12-31',NULL,0),
('KATA1000',1000,8000,'2027-12-31',50,50),
('RAINY300',300,2000,'2026-10-31',NULL,0);

-- §9 ทีมงาน · §10 ผู้เข้าพักตัวอย่าง
INSERT INTO staff_users (id, email, display_name, role, photo) VALUES
(1,'wipa@sabaijang.test','คุณวิภา','GM','/brand/people/staff-gm-wipa.jpg'),
(2,'golf@sabaijang.test','คุณกอล์ฟ','SALES','/brand/people/staff-sales-golf.jpg'),
(3,'muk@sabaijang.test','น้องมุก','FRONT','/brand/people/staff-front-muk.jpg'),
(4,'chai@sabaijang.test','พี่ชัย','ROOMS','/brand/people/staff-room-chai.jpg');
SELECT setval('staff_users_id_seq', 4);

INSERT INTO users (id, email, display_name, phone, email_verified, birth_date, lang, photo, created_at) VALUES
(1,'nan@sabaijang.test','คุณแนน','081-111-1111',true,'1995-08-14','th','/brand/people/guest-nan.jpg','2025-01-10T10:00:00+07:00'),
(2,'aom@sabaijang.test','คุณอ้อม','081-222-2222',true,'1988-03-22','th','/brand/people/guest-aom-family.jpg','2025-06-01T10:00:00+07:00'),
(3,'ploy@sabaijang.test','คุณพลอย','081-333-3333',false,'1996-11-05','th','/brand/people/guest-ploy-jay.jpg','2027-02-20T10:00:00+07:00'),
(4,'chen@sabaijang.test','Ms. Chen Yu','+86-138-0000-0000',true,'1993-02-18','en','/brand/people/guest-chen.jpg','2025-12-01T10:00:00+07:00'),
(5,'boundary@sabaijang.test','สมาชิกทดสอบ 100 แต้ม','080-000-0100',true,'1990-06-01','th',NULL,'2026-01-01T10:00:00+07:00');
SELECT setval('users_id_seq', 5);

INSERT INTO points_ledger (user_id, delta, reason, created_at) VALUES
(1,250,'SEED','2026-12-31T10:00:00+07:00'),
(2,99,'SEED','2026-12-31T10:00:00+07:00'),
(4,120,'SEED','2026-12-31T10:00:00+07:00'),
(5,100,'SEED','2026-12-31T10:00:00+07:00');

INSERT INTO fx_rates (currency, thb_per_unit) VALUES ('USD',35.00),('EUR',38.00),('CNY',4.90);

-- การจองตั้งต้น (สถานะต่าง ๆ ไว้สาธิตและทดสอบ)
INSERT INTO bookings (code,user_id,contact_name,contact_email,contact_phone,lang,plan,status,hold_token,check_in,check_out,has_peak,total,room_total,deposit,paid,due_at_hotel,free_cancel_until,points_to_earn,points_earned,created_at,confirmed_at,arrival_time) VALUES
-- คุณแนน พักแล้ว 3 ครั้ง (§10)
('SJ-2026-100001',1,'คุณแนน','nan@sabaijang.test','081-111-1111','th','BREAKFAST','CHECKED_OUT','seed','2026-06-10','2026-06-12',false,5600,4800,1680,5600,0,'2026-06-07T14:00:00+07:00',48,48,'2026-05-01T10:00:00+07:00','2026-05-01T10:05:00+07:00',NULL),
('SJ-2026-100002',1,'คุณแนน','nan@sabaijang.test','081-111-1111','th','ROOM_ONLY','CHECKED_OUT','seed','2026-11-20','2026-11-22',false,6400,6400,1920,6400,0,'2026-11-17T14:00:00+07:00',64,64,'2026-10-01T10:00:00+07:00','2026-10-01T10:05:00+07:00',NULL),
('SJ-2027-100003',1,'คุณแนน','nan@sabaijang.test','081-111-1111','th','ROOM_ONLY','CHECKED_OUT','seed','2027-02-20','2027-02-22',false,9200,9200,2760,9200,0,'2027-02-17T14:00:00+07:00',92,92,'2027-01-05T10:00:00+07:00','2027-01-05T10:05:00+07:00',NULL),
-- Ms. Chen ใช้สิทธิ์เดือนเกิด 2027 แล้ว (พัก 5–7 ก.พ.)
('SJ-2027-100004',4,'Ms. Chen Yu','chen@sabaijang.test','+86-138-0000-0000','en','ROOM_ONLY','CHECKED_OUT','seed','2027-02-05','2027-02-07',true,10200,10200,3060,10200,0,'2027-01-22T14:00:00+07:00',102,102,'2026-12-01T10:00:00+07:00','2026-12-01T10:05:00+07:00',NULL),
-- แขกเช็กอินวันนี้ 1 มี.ค. (รายการแขก US-53)
('SJ-2027-200001',NULL,'คุณต่อ','tor@example.test','089-555-0001','th','ROOM_ONLY','CONFIRMED','seed','2027-03-01','2027-03-03',false,4800,4800,1440,1440,3360,'2027-02-26T14:00:00+07:00',0,0,'2027-02-27T09:00:00+07:00','2027-02-27T09:05:00+07:00','18:00'),
('SJ-2027-200002',2,'คุณอ้อม','aom@sabaijang.test','081-222-2222','th','BREAKFAST','CONFIRMED','seed','2027-03-01','2027-03-04',false,19200,15000,5760,5760,13440,'2027-02-26T14:00:00+07:00',150,0,'2027-01-15T09:00:00+07:00','2027-01-15T09:05:00+07:00','15:00'),
-- แขกเช็กเอาต์วันนี้ (อยู่ในห้อง)
('SJ-2027-200003',1,'คุณแนน','nan@sabaijang.test','081-111-1111','th','ROOM_ONLY','CHECKED_IN','seed','2027-02-27','2027-03-01',false,5900,5900,1770,1770,4130,'2027-02-24T14:00:00+07:00',59,0,'2027-02-01T09:00:00+07:00','2027-02-01T09:05:00+07:00',NULL),
-- R06 คืน 24 ธ.ค. 2027 ขายครบ 2 หลัง (US-03 ข้อ 1)
('SJ-2027-300001',NULL,'Mr. Daniel Weber','daniel@example.test','+49-170-000-0000','en','ROOM_ONLY','CONFIRMED','seed','2027-12-23','2027-12-26',true,42000,42000,12600,12600,29400,'2027-12-09T14:00:00+07:00',0,0,'2027-02-10T09:00:00+07:00','2027-02-10T09:05:00+07:00',NULL),
('SJ-2027-300002',4,'Ms. Chen Yu','chen@sabaijang.test','+86-138-0000-0000','en','ROOM_ONLY','CONFIRMED','seed','2027-12-24','2027-12-25',true,12600,12600,12600,12600,0,NULL,126,0,'2027-02-11T09:00:00+07:00','2027-02-11T09:05:00+07:00',NULL),
-- R03 1–5 ส.ค. 2027 ห้อง 305 มีการจองแล้ว (US-51 ข้อ 2) และ R03 คืน 10 ส.ค. เหลือห้องสุดท้าย
('SJ-2027-300003',3,'คุณพลอย','ploy@sabaijang.test','081-333-3333','th','HONEYMOON','CONFIRMED','seed','2027-08-01','2027-08-03',false,9500,7000,2850,2850,6650,'2027-07-29T14:00:00+07:00',0,0,'2027-02-20T10:00:00+07:00','2027-02-20T10:05:00+07:00',NULL);

INSERT INTO booking_rooms (id, booking_code, room_type_code, room_no, adults) VALUES
(1,'SJ-2026-100001','R02','112',2),
(2,'SJ-2026-100002','R02','113',2),
(3,'SJ-2027-100003','R03','302',2),
(4,'SJ-2027-100004','R01','105',1),
(5,'SJ-2027-200001','R01',NULL,1),
(6,'SJ-2027-200002','R04',NULL,2),
(7,'SJ-2027-200003','R02','214',2),
(8,'SJ-2027-300001','R06','V1',2),
(9,'SJ-2027-300002','R06','V2',2),
(10,'SJ-2027-300003','R03','305',2);
SELECT setval('booking_rooms_id_seq', 10);

INSERT INTO booking_guests (booking_room_id, kind, age_at_checkin)
SELECT id, 'ADULT', NULL FROM booking_rooms, generate_series(1, adults);
INSERT INTO booking_guests (booking_room_id, kind, age_at_checkin) VALUES (6,'CHILD',8),(6,'CHILD',3);
UPDATE booking_rooms SET special_request = 'ขอเตียงเด็กเพิ่มหมอน · มาถึงประมาณบ่ายสาม' WHERE id = 6;
UPDATE booking_rooms SET special_request = 'Late arrival, please keep the room' WHERE id = 5;

INSERT INTO booking_nights (booking_room_id, night, season_kind, base_price)
SELECT br.id, d::date,
  CASE WHEN d::date BETWEEN '2026-12-20' AND '2027-01-05' OR d::date BETWEEN '2027-02-05' AND '2027-02-08' OR d::date BETWEEN '2027-12-20' AND '2028-01-05' THEN 'PEAK'
       WHEN d::date BETWEEN '2026-05-01' AND '2026-10-31' OR d::date BETWEEN '2027-05-01' AND '2027-10-31' THEN 'LOW' ELSE 'HIGH' END,
  0
FROM booking_rooms br JOIN bookings b ON b.code = br.booking_code
CROSS JOIN generate_series(b.check_in, b.check_out - 1, interval '1 day') d;
UPDATE booking_nights bn SET base_price = sr.price
FROM booking_rooms br, season_rates sr
WHERE br.id = bn.booking_room_id AND sr.room_type_code = br.room_type_code AND sr.kind = bn.season_kind;

INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount)
SELECT code, 1, 'ROOM', 'ค่าห้อง', 'Room', room_total FROM bookings;
INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount)
SELECT code, 2, 'EXTRA', 'อาหารเช้าและแพ็กเกจ', 'Breakfast and package', total - room_total FROM bookings WHERE total > room_total;

INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at)
SELECT code, 'CARD', 'CHARGE', paid, 'SUCCESS', '4242', 'seed-' || code, confirmed_at FROM bookings WHERE paid > 0;

INSERT INTO birthday_redemptions (user_id, year, booking_code) VALUES (4, 2027, 'SJ-2027-100004');

INSERT INTO booking_addons (booking_code, kind, price, status, flight_no, arrive_time) VALUES
('SJ-2027-200002','VAN',1200,'CONFIRMED','TG203','13:30'),
('SJ-2027-200001','LATE_OUT',1000,'PENDING',NULL,NULL);

UPDATE bookings SET nonref = true WHERE code = 'SJ-2027-300002';
UPDATE bookings SET priced_at = created_at;
-- unique, unguessable access token per seeded booking (no shared 'seed' token)
UPDATE bookings SET hold_token = md5(code || clock_timestamp()::text || random()::text);

-- นับห้องที่ขายแล้วรายคืนจากการจองที่ยังถือห้อง
UPDATE inventory_nights inv SET sold = s.n
FROM (
  SELECT br.room_type_code, bn.night, count(*) AS n
  FROM booking_nights bn JOIN booking_rooms br ON br.id = bn.booking_room_id
  JOIN bookings b ON b.code = br.booking_code
  WHERE b.status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT')
  GROUP BY 1, 2
) s
WHERE inv.room_type_code = s.room_type_code AND inv.night = s.night;

-- R03 คืน 10 ส.ค. 2027 เหลือห้องสุดท้าย 1 ห้อง (US-03 ข้อ 2) · R05 คืน 15–16 ส.ค. เหลือ 1 (ป้ายห้องสุดท้าย)
UPDATE inventory_nights SET sold = 5 WHERE room_type_code = 'R03' AND night = '2027-08-10';
UPDATE inventory_nights SET sold = 2 WHERE room_type_code = 'R05' AND night IN ('2027-08-15','2027-08-16');

-- รีวิวเก่า (US-47)
INSERT INTO reviews (booking_code, room_type_code, author_name, author_photo, room_score, service_score, clean_score, location_score, body, lang, created_at) VALUES
('SJ-2026-100001','R02','คุณแนน','/brand/people/guest-nan.jpg',5,5,5,4,'ห้องสวยมาก ระเบียงมองสวนเงียบสงบ อาหารเช้าหลากหลาย พนักงานยิ้มแย้มทุกคน','th','2026-06-13T10:00:00+07:00'),
('SJ-2027-100003','R03','คุณแนน','/brand/people/guest-nan.jpg',5,4,5,5,'ลงสระจากหน้าห้องได้เลย ชอบมาก เดินไปหาดกะตะแค่ไม่กี่นาที','th','2027-02-23T10:00:00+07:00'),
('SJ-2027-100004','R01','Ms. Chen Yu','/brand/people/guest-chen.jpg',4,5,4,5,'Lovely stay over Chinese New Year. Staff surprised me with a birthday cake!','en','2027-02-08T10:00:00+07:00');
INSERT INTO review_replies (review_id, staff_id, body, created_at) VALUES
(1,1,'ขอบคุณคุณแนนมากค่ะ ยินดีต้อนรับกลับมาเสมอ','2026-06-14T10:00:00+07:00'),
(3,3,'Thank you Ms. Chen! Happy birthday again from all of us.','2027-02-09T10:00:00+07:00');

SELECT setval('reviews_id_seq', 3);
