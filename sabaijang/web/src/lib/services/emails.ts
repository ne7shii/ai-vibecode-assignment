import { baht, fmtDate, fmtDateTime, type Lang } from '@/lib/format';
import type { BookingView } from './bookings';

const SITE = process.env.PUBLIC_URL ?? 'http://localhost:3100';
const MAP = 'https://maps.google.com/?q=Kata+Beach+Phuket';

function roomsLine(b: BookingView, lang: Lang) {
  return b.rooms.map((r) => {
    const kids = r.childAges.length ? (lang === 'th' ? ` · เด็ก ${r.childAges.length} (อายุ ${r.childAges.join(', ')})` : ` · ${r.childAges.length} child(ren) (age ${r.childAges.join(', ')})`) : '';
    return `- ${lang === 'th' ? r.nameTh : r.nameEn} (${r.nameEn}) · ${lang === 'th' ? `ผู้ใหญ่ ${r.adults}` : `${r.adults} adult(s)`}${kids}${r.extraBed ? (lang === 'th' ? ' · เตียงเสริม' : ' · extra bed') : ''}`;
  }).join('\n');
}

export function confirmationEmail(b: BookingView) {
  const lang = (b.lang === 'en' ? 'en' : 'th') as Lang;
  const promos = b.promotions.filter((p) => p.saved > 0).map((p) => (lang === 'th' ? p.nameTh : p.nameEn)).join(', ') || '-';
  const cancel = b.freeCancelUntil
    ? fmtDateTime(b.freeCancelUntil, lang)
    : (lang === 'th' ? 'ไม่คืนเงิน (Non-refundable)' : 'Non-refundable');
  const manage = `${SITE}/${lang}/manage?code=${b.code}`;
  if (lang === 'th') {
    return {
      subject: `ยืนยันการจอง ${b.code} · CWN สบายจัง รีสอร์ท`,
      body: [
        `เรียน ${b.contact.name}`,
        `ขอบคุณที่จองกับ CWN สบายจัง รีสอร์ท หาดกะตะ ภูเก็ต`,
        ``,
        `รหัสการจอง: ${b.code}`,
        `เช็กอิน: ${fmtDate(b.checkIn, 'th')} 14:00 · เช็กเอาต์: ${fmtDate(b.checkOut, 'th')} 12:00 (${b.nights} คืน)`,
        `ห้องพัก:`,
        roomsLine(b, 'th'),
        `แผนราคา: ${b.planLabel.th}`,
        `โปรที่ใช้: ${promos}`,
        `ยอดรวม: ${baht(b.total)}`,
        `ชำระแล้ว: ${baht(b.paid)}`,
        `ชำระที่โรงแรม: ${baht(b.dueAtHotel)}`,
        `ยกเลิกฟรีได้ถึง: ${cancel}`,
        ``,
        `จัดการการจอง: ${manage}`,
        `แผนที่: ${MAP}`,
      ].join('\n'),
    };
  }
  return {
    subject: `Booking confirmed ${b.code} · CWN Sabai Jang Resort`,
    body: [
      `Dear ${b.contact.name},`,
      `Thank you for booking CWN Sabai Jang Resort, Kata Beach, Phuket.`,
      ``,
      `Booking code: ${b.code}`,
      `Check-in: ${fmtDate(b.checkIn, 'en')} 14:00 · Check-out: ${fmtDate(b.checkOut, 'en')} 12:00 (${b.nights} night(s))`,
      `Rooms:`,
      roomsLine(b, 'en'),
      `Rate plan: ${b.planLabel.en}`,
      `Promotions: ${promos}`,
      `Total: ${baht(b.total)}`,
      `Paid: ${baht(b.paid)}`,
      `Pay at hotel: ${baht(b.dueAtHotel)}`,
      `Free cancellation until: ${cancel}`,
      ``,
      `Manage booking: ${manage}`,
      `Map: ${MAP}`,
    ].join('\n'),
  };
}

export function hotelLine(event: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_CHANGED', b: BookingView, extra = '') {
  const label = { BOOKING_CONFIRMED: 'จองใหม่', BOOKING_CANCELLED: 'ยกเลิก', BOOKING_CHANGED: 'เปลี่ยนวัน' }[event];
  return {
    subject: `[${label}] ${b.code}`,
    body: `[${label}] ${b.code} · ${b.rooms.map((r) => r.roomType).join(', ')} · ${fmtDate(b.checkIn)} – ${fmtDate(b.checkOut)} · ${b.contact.name}${extra ? ` · ${extra}` : ''}`,
  };
}
