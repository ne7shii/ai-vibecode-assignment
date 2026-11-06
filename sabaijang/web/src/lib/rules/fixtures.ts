// Test fixtures copied from interview/OWNER-ANSWERS.md (§2, §3, §7). Used by unit tests only.
import type { Season, RateTable, RoomTypeSpec, Promotion, PromoCode } from './types';

export const SEASONS: Season[] = [
  { kind: 'HIGH', start: '2026-11-01', end: '2027-04-30' },
  { kind: 'PEAK', start: '2026-12-20', end: '2027-01-05' },
  { kind: 'PEAK', start: '2027-02-05', end: '2027-02-08' },
  { kind: 'PEAK', start: '2027-04-11', end: '2027-04-16' },
  { kind: 'LOW', start: '2027-05-01', end: '2027-10-31' },
  { kind: 'HIGH', start: '2027-11-01', end: '2028-04-30' },
  { kind: 'PEAK', start: '2027-12-20', end: '2028-01-05' },
  { kind: 'PEAK', start: '2028-01-25', end: '2028-01-28' },
  { kind: 'PEAK', start: '2028-04-11', end: '2028-04-16' },
  { kind: 'LOW', start: '2028-05-01', end: '2028-10-31' },
  { kind: 'HIGH', start: '2028-11-01', end: '2029-04-30' },
];

export const RATES: RateTable = {
  season: {
    R01: { LOW: 1800, HIGH: 2400, PEAK: 3200 },
    R02: { LOW: 2400, HIGH: 3200, PEAK: 4200 },
    R03: { LOW: 3500, HIGH: 4600, PEAK: 6000 },
    R04: { LOW: 3800, HIGH: 5000, PEAK: 6500 },
    R05: { LOW: 5000, HIGH: 6500, PEAK: 8500 },
    R06: { LOW: 8000, HIGH: 10500, PEAK: 14000 },
  },
  date: { R01: { '2027-02-14': 2900 } },
};

export const ROOM_TYPES: Record<string, RoomTypeSpec> = {
  R01: { code: 'R01', maxAdults: 2, maxTotal: 3, extraBedAllowed: false },
  R02: { code: 'R02', maxAdults: 2, maxTotal: 3, extraBedAllowed: true },
  R03: { code: 'R03', maxAdults: 2, maxTotal: 3, extraBedAllowed: false },
  R04: { code: 'R04', maxAdults: 3, maxTotal: 5, extraBedAllowed: false },
  R05: { code: 'R05', maxAdults: 3, maxTotal: 4, extraBedAllowed: true },
  R06: { code: 'R06', maxAdults: 4, maxTotal: 6, extraBedAllowed: false },
};

const p = (x: Partial<Promotion> & Pick<Promotion, 'code' | 'grp' | 'kind'>): Promotion => ({
  nameTh: x.code, nameEn: x.code, value: 0, rules: {}, quota: null, used: 0, memberOnly: false, active: true, ...x,
});

export const PROMOS: Promotion[] = [
  p({ code: 'PR-01', grp: 'PRICE', kind: 'PERCENT', value: 15, nameEn: 'Early Bird', rules: { minLeadDays: 60 } }),
  p({ code: 'PR-02', grp: 'PRICE', kind: 'PERCENT', value: 10, nameEn: 'Last Minute', rules: { maxLeadDays: 3, allSeasons: ['LOW'], noPeak: true } }),
  p({ code: 'PR-03', grp: 'PRICE', kind: 'FREE_NIGHT', value: 4, nameEn: 'Stay 4 Pay 3', rules: { every: 4, noPeak: true } }),
  p({ code: 'PR-04', grp: 'PRICE', kind: 'PERCENT', value: 20, nameEn: 'Long Stay', rules: { minNights: 7, noPeak: true } }),
  p({ code: 'PR-05', grp: 'PRICE', kind: 'PERCENT', value: 15, nameEn: 'Birthday Month', rules: { birthday: true }, memberOnly: true }),
  p({ code: 'PR-06', grp: 'PRICE', kind: 'PERCENT', value: 30, nameEn: 'Flash Sale', quota: 10, used: 3,
      rules: { roomTypes: ['R02'], saleFrom: '2027-02-28T12:00:00+07:00', saleTo: '2027-03-02T12:00:00+07:00', stayFrom: '2027-05-01', stayTo: '2027-09-30', noPeak: true, flash: true } }),
  p({ code: 'PR-07', grp: 'STACK', kind: 'PERCENT', value: 10, nameEn: 'Non-refundable' }),
  p({ code: 'PR-08', grp: 'STACK', kind: 'PERCENT', value: 5, nameEn: 'Member Deal', memberOnly: true }),
  p({ code: 'PR-10', grp: 'PLAN', kind: 'GREEN', nameEn: 'Green Season Getaway', rules: { allSeasons: ['LOW'], minNights: 2 } }),
  p({ code: 'PR-11', grp: 'PLAN', kind: 'HONEYMOON', value: 2500, nameEn: 'Honeymoon', rules: { roomTypes: ['R03', 'R06'], minNights: 2, minLeadDays: 3 } }),
  p({ code: 'PR-12', grp: 'PLAN', kind: 'FAMILY_SUMMER', nameEn: 'Family Summer', rules: { stayFrom: '2027-03-15', stayTo: '2027-05-15' } }),
  p({ code: 'PR-13C', grp: 'PLAN', kind: 'FESTIVAL', value: 4000, nameEn: 'Countdown', rules: { stayFrom: '2027-12-31', stayTo: '2027-12-31' } }),
];

export const CODES: Record<string, PromoCode> = {
  WELCOME500: { code: 'WELCOME500', discount: 500, minRoomTotal: 3000, validUntil: '2027-12-31', maxUses: null, used: 0, active: true },
  KATA1000: { code: 'KATA1000', discount: 1000, minRoomTotal: 8000, validUntil: '2027-12-31', maxUses: 50, used: 50, active: true },
  RAINY300: { code: 'RAINY300', discount: 300, minRoomTotal: 2000, validUntil: '2026-10-31', maxUses: null, used: 0, active: true },
};
