import { bkk } from './clock';

export type Lang = 'th' | 'en';
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2027-03-10' → '10 มี.ค. 2027' / '10 Mar 2027' */
export function fmtDate(date: string, lang: Lang = 'th') {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${(lang === 'th' ? TH_MONTHS : EN_MONTHS)[m - 1]} ${y}`;
}

export function fmtDateTime(instant: Date | string, lang: Lang = 'th') {
  const p = bkk(new Date(instant));
  return `${fmtDate(p.date, lang)} ${p.time}`;
}

export function fmtMonth(month: string, lang: Lang = 'th') {
  const [y, m] = month.split('-').map(Number);
  return lang === 'th' ? `${['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'][m - 1]} ${y}`
    : `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${y}`;
}

export const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;
export const bahtExact = (n: number) => `฿${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
