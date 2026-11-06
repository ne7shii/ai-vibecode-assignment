import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { answerChat } from './chat';
import { POST as chatPost } from '@/app/api/chat/route';

const ctx = { params: Promise.resolve({}) };
const ask = (message: string, lang: 'th' | 'en' = 'th') => answerChat({ message, lang });
const LINE = '@cwnsabaijang';
const PHONE = '076-123-456';

beforeEach(async () => { await resetDatabase(); });

describe('US-50 ข้อ 1 · คำถามทั่วไปตอบตามข้อมูลบนเว็บ', () => {
  it('เวลาเช็กอิน / เช็กเอาต์ 14:00 / 12:00 (ไทยและอังกฤษ)', async () => {
    for (const r of [await ask('เช็กอินกี่โมงคะ'), await ask('เช็คเอาท์กี่โมง'), await ask('What time is check-in?', 'en')]) {
      expect(r.reply).toContain('14:00');
      expect(r.reply).toContain('12:00');
    }
    expect((await ask('What time is check-out?', 'en')).reply).toMatch(/check-in.*14:00/i);
  });

  it('ราคาอาหารเช้า: ผู้ใหญ่ ฿400 · เด็ก 4–11 ปี ฿200 · ต่ำกว่า 4 ปี ฟรี', async () => {
    const th = await ask('อาหารเช้าราคาเท่าไร');
    expect(th.reply).toMatch(/฿400/);
    expect(th.reply).toMatch(/4–11.*฿200/);
    expect(th.reply).toMatch(/ต่ำกว่า 4 ปี.*ฟรี/);
    const en = await ask('How much is breakfast?', 'en');
    expect(en.reply).toMatch(/฿400/);
    expect(en.reply).toMatch(/4–11.*฿200/);
    expect(en.reply).toMatch(/under 4.*free/i);
  });

  it('นโยบายเด็ก: ต่ำกว่า 12 ปีพักฟรีเมื่อใช้เตียงเดิม', async () => {
    const th = await ask('เด็กพักฟรีไหม');
    expect(th.reply).toMatch(/12/);
    expect(th.reply).toMatch(/ฟรี/);
    expect(th.reply).toMatch(/เตียงเดิม/);
    const en = await ask('Do kids stay free?', 'en');
    expect(en.reply).toMatch(/under 12/i);
    expect(en.reply).toMatch(/free/i);
  });

  it('วิธีเดินทาง: สนามบิน HKT 45 กม. ~60 นาที · รถเก๋ง ฿800 · รถตู้ ฿1,200', async () => {
    for (const r of [await ask('เดินทางจากสนามบินยังไง'), await ask('How do I get there from the airport?', 'en')]) {
      expect(r.reply).toMatch(/HKT/);
      expect(r.reply).toMatch(/45/);
      expect(r.reply).toMatch(/60/);
      expect(r.reply).toMatch(/฿800/);
      expect(r.reply).toMatch(/฿1,200/);
    }
  });

  it('ถามเหมือนเดิมต้องตอบเหมือนเดิม (§8)', async () => {
    for (const q of ['อาหารเช้าราคาเท่าไร', '2 คน 12–14 ส.ค.', 'มีที่จอดรถให้เช่าเรือไหม']) expect(await ask(q)).toEqual(await ask(q));
  });
});

describe('US-50 ข้อ 2 · ถามห้องว่าง', () => {
  it('"2 คน 12–14 ส.ค." → ห้องว่างทุกประเภท ราคาเริ่มต้น ฿2,754 (R01 Low ฿1,800×2 −Early Bird 15% −Non-ref 10%) และลิงก์ไปหน้าจอง', async () => {
    const res = await chatPost(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ message: '2 คน 12–14 ส.ค.', lang: 'th' }) }), ctx);
    expect(res.status).toBe(200);
    const r = await res.json();
    for (const name of ['ซุพีเรียร์', 'ดีลักซ์ การ์เด้นวิว', 'ดีลักซ์ พูลแอคเซส', 'แฟมิลี่รูม', 'จูเนียร์ สวีท', 'พูลวิลล่า']) expect(r.reply).toContain(name);
    expect(r.reply).toContain('฿2,754');
    expect(r.links).toContainEqual({ label: expect.any(String), href: '/th/book?checkIn=2027-08-12&checkOut=2027-08-14&adults=2' });
  });

  it('ภาษาอังกฤษ "2 adults 12-14 Aug" → ชื่อห้องภาษาอังกฤษ ลิงก์ /en/book', async () => {
    const r = await ask('Any rooms for 2 adults 12-14 Aug?', 'en');
    expect(r.reply).toContain('Superior');
    expect(r.reply).toContain('Pool Villa');
    expect(r.reply).toContain('฿2,754');
    expect(r.links).toContainEqual({ label: expect.any(String), href: '/en/book?checkIn=2027-08-12&checkOut=2027-08-14&adults=2' });
  });

  it('4 คน → แสดงเฉพาะห้องที่รับผู้ใหญ่ 4 ได้ (จูเนียร์ สวีท + เตียงเสริม, พูลวิลล่า) ไม่มีซุพีเรียร์', async () => {
    const r = await ask('4 คน 12–14 ส.ค.');
    expect(r.reply).toContain('พูลวิลล่า');
    expect(r.reply).not.toContain('ซุพีเรียร์');
  });

  it('เต็มทุกห้อง → บอกว่าไม่มีห้องว่าง และเสนอวันใกล้เคียงพร้อมลิงก์', async () => {
    await query(`UPDATE inventory_nights SET sold = total - closed - held WHERE night = '2027-08-12'`);
    const r = await ask('2 คน 12–14 ส.ค.');
    expect(r.reply).toContain('ไม่มีห้องว่าง');
    expect(r.links).toContainEqual({ label: expect.any(String), href: '/th/book?checkIn=2027-08-13&checkOut=2027-08-15&adults=2' });
  });

  it('วันที่จองไม่ได้ (Peak ขั้นต่ำ 2 คืน) → บอกเหตุผลและช่องทางติดต่อ ไม่มีลิงก์จอง', async () => {
    const r = await ask('2 คน 24–25 ธ.ค.');
    expect(r.reply).toContain(LINE);
    expect(r.links.some((l) => l.href.includes('/book'))).toBe(false);
  });
});

describe('US-50 ข้อ 3 · ตอบไม่ได้ → LINE / โทรศัพท์', () => {
  it('คำถามที่ไม่รู้จัก → LINE @cwnsabaijang และโทร 076-123-456', async () => {
    for (const r of [await ask('ช่วยแนะนำร้านนวดแถวนั้นหน่อย'), await ask('Can I bring my drone?', 'en')]) {
      expect(r.reply).toContain(LINE);
      expect(r.reply).toContain(PHONE);
      expect(r.links).toContainEqual({ label: expect.stringContaining(LINE), href: 'https://line.me/R/ti/p/@cwnsabaijang' });
      expect(r.links).toContainEqual({ label: expect.stringContaining(PHONE), href: 'tel:076123456' });
    }
  });
});
