// Chatbot (US-50): fixed rules from the hotel's own data (OWNER-ANSWERS §1, §3, §4, US data table).
// No AI and no network. Same question + same site state → same answer (§8).
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { daysBetween } from '@/lib/rules/calendar';
import { RuleError } from '@/lib/rules/types';
import { baht, fmtDate, type Lang } from '@/lib/format';
import { searchRooms } from './search';

export interface ChatLink { label: string; href: string }
export interface ChatAnswer { reply: string; links: ChatLink[] }

const LINE_ID = '@cwnsabaijang';
const PHONE = '076-123-456';
const CONTACT_LINKS: ChatLink[] = [
  { label: `LINE ${LINE_ID}`, href: 'https://line.me/R/ti/p/@cwnsabaijang' },
  { label: `โทร / Call ${PHONE}`, href: 'tel:076123456' },
];
const contactLine = (lang: Lang) => lang === 'th'
  ? `ติดต่อโรงแรมได้ทาง LINE ${LINE_ID} หรือโทร ${PHONE}`
  : `Please contact the hotel on LINE ${LINE_ID} or call ${PHONE}`;

// ---------- availability parsing ----------

const MONTHS: [string, number][] = [
  ['มกราคม', 1], ['กุมภาพันธ์', 2], ['มีนาคม', 3], ['เมษายน', 4], ['พฤษภาคม', 5], ['มิถุนายน', 6],
  ['กรกฎาคม', 7], ['สิงหาคม', 8], ['กันยายน', 9], ['ตุลาคม', 10], ['พฤศจิกายน', 11], ['ธันวาคม', 12],
  ['มี.ค.', 3], ['ม.ค.', 1], ['ก.พ.', 2], ['เม.ย.', 4], ['พ.ค.', 5], ['มิ.ย.', 6], ['ก.ค.', 7], ['ส.ค.', 8], ['ก.ย.', 9], ['ต.ค.', 10], ['พ.ย.', 11], ['ธ.ค.', 12],
  ['january', 1], ['february', 2], ['march', 3], ['april', 4], ['june', 6], ['july', 7], ['august', 8], ['september', 9], ['october', 10], ['november', 11], ['december', 12],
  ['sept', 9], ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6], ['jul', 7], ['aug', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dec', 12],
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Thai abbreviations may be typed without the dots ("สค"); English names must not run into other letters.
const monthAlt = MONTHS.map(([m]) => (/[a-z]/.test(m) ? `${esc(m)}\\.?(?![a-z])` : m.split('.').filter(Boolean).map(esc).join('\\.?') + (m.endsWith('.') ? '\\.?' : ''))).join('|');
const MON = `(${monthAlt})`;
const DAY = '(?<!\\d)(\\d{1,2})(?!\\d)';
const SEP = '\\s*(?:-|to|until|till|ถึง)\\s*';
const YEAR = '(?:,?\\s*(\\d{4}))?';
const P_DAY_FIRST = new RegExp(`${DAY}\\s*(?:${MON})?${SEP}${DAY}\\s*${MON}${YEAR}`);
const P_MONTH_FIRST = new RegExp(`${MON}\\s*${DAY}${SEP}(?:${MON}\\s*)?${DAY}${YEAR}`);
const P_PEOPLE = /(?<!\d)(\d{1,2})\s*(?:คน|ท่าน|ผู้ใหญ่|adults?(?![a-z])|people|persons?|pax|guests?)/;
const P_PEOPLE_AFTER = /(?:ผู้ใหญ่|adults?)\s*(\d{1,2})(?!\d)/;

function monthOf(token: string | undefined): number | null {
  if (!token) return null;
  const t = token.replace(/\./g, '');
  return MONTHS.find(([m]) => m.replace(/\./g, '') === t)?.[1] ?? null;
}

function validDate(y: number, m: number, d: number): string | null {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null;
}

export interface AvailabilityQuery { checkIn: string; checkOut: string; adults: number }

/** "2 คน 12–14 ส.ค." / "2 adults 12-14 Aug" → dates in the next occurrence from `today` (site clock). */
export function parseAvailability(message: string, today: string): AvailabilityQuery | null {
  const s = message.toLowerCase().replace(/[–—−]/g, '-');
  let d1: number, d2: number, m1: number | null, m2: number | null, yearTxt: string | undefined;
  const a = s.match(P_DAY_FIRST);
  const b = a ? null : s.match(P_MONTH_FIRST);
  if (a) {
    d1 = Number(a[1]); m1 = monthOf(a[2]); d2 = Number(a[3]); m2 = monthOf(a[4]); yearTxt = a[5];
    if (m1 === null && m2 !== null) m1 = d1 > d2 ? ((m2 + 10) % 12) + 1 : m2;
  } else if (b) {
    m1 = monthOf(b[1]); d1 = Number(b[2]); m2 = monthOf(b[3]) ?? m1; d2 = Number(b[4]); yearTxt = b[5];
    if (b[3] === undefined && m1 !== null && d1 > d2) m2 = (m1 % 12) + 1;
  } else {
    return null;
  }
  if (!m1 || !m2) return null;

  const crosses = m2 < m1;
  let y1: number;
  if (yearTxt) {
    let y = Number(yearTxt);
    if (y > 2400) y -= 543; // พ.ศ.
    y1 = crosses ? y - 1 : y;
  } else {
    y1 = Number(today.slice(0, 4));
    const first = validDate(y1, m1, d1);
    if (first && first < today) y1 += 1;
  }
  const checkIn = validDate(y1, m1, d1);
  const checkOut = validDate(crosses ? y1 + 1 : y1, m2, d2);
  if (!checkIn || !checkOut || daysBetween(checkIn, checkOut) < 1) return null;

  // People: take the number next to a unit, skipping the date numbers themselves.
  const people = s.match(P_PEOPLE) ?? s.match(P_PEOPLE_AFTER);
  const adults = people ? Number(people[1]) : 2;
  return { checkIn, checkOut, adults: adults >= 1 ? adults : 2 };
}

// ---------- fixed answers ----------

const INTENTS: { re: RegExp; answer: (lang: Lang) => ChatAnswer }[] = [
  {
    re: /อาหารเช้า|breakfast/,
    answer: (lang) => ({
      reply: lang === 'th'
        ? 'อาหารเช้าที่ห้องอาหาร "ครัวสบาย" 06:30–10:30 · ผู้ใหญ่ ฿400 · เด็ก 4–11 ปี ฿200 · เด็กต่ำกว่า 4 ปี ฟรี (ต่อคน ต่อคืน) · เลือกแผน "รวมอาหารเช้า" ได้ตอนจอง'
        : 'Breakfast is served at "Krua Sabai" 06:30–10:30 · adults ฿400 · children 4–11 ฿200 · children under 4 free (per person per night) · choose the "Breakfast included" plan when you book',
      links: [],
    }),
  },
  {
    re: /เช็[คก]\s*อิน|เช็[คก]\s*เอา[ทต]์?|check[\s-]?in|check[\s-]?out|เข้าห้องได้กี่โมง|ออกจากห้อง/,
    answer: (lang) => ({
      reply: lang === 'th'
        ? 'เช็กอิน 14:00 · เช็กเอาต์ 12:00 · ขอ Early check-in ตั้งแต่ 10:00 (฿800) หรือ Late check-out ถึง 18:00 (฿1,000) ได้ในหน้าจอง'
        : 'Check-in is from 14:00 and check-out is by 12:00 · early check-in from 10:00 (฿800) or late check-out until 18:00 (฿1,000) can be requested when you book',
      links: [],
    }),
  },
  {
    re: /เด็ก|ลูก|ทารก|child|kid|baby|infant/,
    answer: (lang) => ({
      reply: lang === 'th'
        ? 'เด็กอายุต่ำกว่า 12 ปี (นับอายุ ณ วันเช็กอิน) พักฟรีเมื่อใช้เตียงเดิม ตราบที่ไม่เกินจำนวนคนสูงสุดของห้อง · อายุ 12 ปีขึ้นไปนับเป็นผู้ใหญ่ · อาหารเช้าเด็ก 4–11 ปี ฿200 ต่ำกว่า 4 ปีฟรี · เตียงเสริม ฿800 ต่อคืน (ดีลักซ์ การ์เด้นวิว และจูเนียร์ สวีท)'
        : 'Children under 12 (age on the check-in day) stay free using the existing beds, as long as the room maximum is not exceeded · 12 and over count as adults · breakfast for children 4–11 is ฿200, under 4 free · extra bed ฿800 per night (Deluxe Garden View and Junior Suite)',
      links: [],
    }),
  },
  {
    re: /สนามบิน|เดินทาง|ไปยังไง|ไปอย่างไร|รถรับส่ง|แผนที่|ที่ตั้ง|airport|get there|getting there|how (?:do i|to) get|directions?|transfer|taxi|where is the hotel/,
    answer: (lang) => ({
      reply: lang === 'th'
        ? 'โรงแรมอยู่ 88 ถนนกะตะ ต.กะรน ภูเก็ต (ห่างหาดกะตะ 400 ม.) · จากสนามบินภูเก็ต (HKT) 45 กม. ประมาณ 60 นาที · รถรับส่งสนามบิน: รถเก๋ง ฿800 ต่อเที่ยว (ไม่เกิน 3 คน) · รถตู้ ฿1,200 ต่อเที่ยว (4–8 คน) จองเพิ่มได้ในหน้าจอง'
        : 'We are at 88 Kata Road, Karon, Phuket (400 m from Kata Beach) · Phuket Airport (HKT) is 45 km, about 60 minutes · airport transfer: car ฿800 per trip (up to 3 people) · van ฿1,200 per trip (4–8 people), add it when you book',
      links: [{ label: lang === 'th' ? 'แผนที่และการเดินทาง' : 'Map and directions', href: `/${lang}/about` }],
    }),
  },
];

const fallback = (lang: Lang): ChatAnswer => ({
  reply: lang === 'th'
    ? `ขออภัยค่ะ แชตบอตยังตอบคำถามนี้ไม่ได้ ${contactLine('th')}`
    : `Sorry, the chatbot cannot answer that yet. ${contactLine('en')}`,
  links: CONTACT_LINKS,
});

const bookHref = (lang: Lang, q: AvailabilityQuery) => `/${lang}/book?checkIn=${q.checkIn}&checkOut=${q.checkOut}&adults=${q.adults}`;

async function availabilityAnswer(q: AvailabilityQuery, lang: Lang): Promise<ChatAnswer> {
  const when = `${fmtDate(q.checkIn, lang)} – ${fmtDate(q.checkOut, lang)}`;
  const nights = daysBetween(q.checkIn, q.checkOut);
  const who = lang === 'th' ? `${nights} คืน · ผู้ใหญ่ ${q.adults} ท่าน` : `${nights} night${nights > 1 ? 's' : ''} · ${q.adults} adult${q.adults > 1 ? 's' : ''}`;
  let r: Awaited<ReturnType<typeof searchRooms>>;
  try {
    r = await searchRooms({ checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, childAges: [] });
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    return { reply: `${when} (${who}): ${e.msg[lang]} · ${contactLine(lang)}`, links: CONTACT_LINKS };
  }
  if (!r.results.length) {
    const alt = r.suggestions.map((s) => ({ label: `${fmtDate(s.checkIn, lang)} – ${fmtDate(s.checkOut, lang)}`, href: bookHref(lang, { ...q, ...s }) }));
    return {
      reply: lang === 'th'
        ? `ไม่มีห้องว่างช่วง ${when} (${who})${alt.length ? ' · ลองวันใกล้เคียงด้านล่าง' : ''} หรือ${contactLine('th')}`
        : `No rooms available for ${when} (${who})${alt.length ? ' · try the nearby dates below' : ''}, or ${contactLine('en').toLowerCase()}`,
      links: [...alt, ...CONTACT_LINKS],
    };
  }
  const rows = r.results.map((x) => {
    const from = Math.min(...x.plans.map((p) => p.total));
    return { name: lang === 'th' ? x.roomType.nameTh : x.roomType.nameEn, from };
  });
  const cheapest = Math.min(...rows.map((x) => x.from));
  const list = rows.map((x) => `• ${x.name} ${lang === 'th' ? 'เริ่มต้น' : 'from'} ${baht(x.from)}`).join('\n');
  return {
    reply: lang === 'th'
      ? `ห้องว่าง ${when} (${who}):\n${list}\nราคาเริ่มต้น ${baht(cheapest)} ต่อการเข้าพัก`
      : `Rooms available ${when} (${who}):\n${list}\nPrices from ${baht(cheapest)} for the whole stay`,
    links: [{ label: lang === 'th' ? 'ดูห้องและจอง' : 'See rooms and book', href: bookHref(lang, q) }],
  };
}

export async function answerChat(i: { message?: string; lang?: string }): Promise<ChatAnswer> {
  const lang: Lang = i.lang === 'en' ? 'en' : 'th';
  const msg = String(i.message ?? '').slice(0, 500);
  const s = msg.toLowerCase();
  const today = bkk((await getClock()).now()).date;
  const q = parseAvailability(msg, today);
  if (q) return availabilityAnswer(q, lang);
  const hit = INTENTS.find((x) => x.re.test(s));
  return hit ? hit.answer(lang) : fallback(lang);
}

