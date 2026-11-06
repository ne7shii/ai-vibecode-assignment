import { test, expect, type Page } from '@playwright/test';

// Critical paths through the real UI. Expected values come from USER-STORIES-HOTEL.md / OWNER-ANSWERS.md.
async function reset(page: Page, now = '2027-03-01T10:00:00+07:00') {
  const r = await page.request.post('/api/test/reset', { data: { now } });
  expect(r.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => { await reset(page); });

test('US-32 / US-34 · ผู้เข้าพักจองจนจ่ายเงิน: บัตรถูกปฏิเสธก่อน แล้วจ่ายสำเร็จ @mobile', async ({ page }) => {
  // R01 10–13 มี.ค. 2027 = High 3 คืน × ฿2,400 = ฿7,200 · มัดจำ 30% = ฿2,160 · ที่โรงแรม ฿5,040
  await page.goto('/th/book?checkIn=2027-03-10&checkOut=2027-03-13&adults=2');
  await expect(page.getByTestId('room-result-R01')).toBeVisible();
  await expect(page.getByTestId('price-R01-ROOM_ONLY')).toContainText('7,200');
  await page.getByTestId('choose-R01-ROOM_ONLY').click();

  await expect(page.getByTestId('booking-flow')).toBeVisible();
  await expect(page.getByTestId('hold-countdown')).toBeVisible();
  await page.getByTestId('input-name').fill('คุณต่อ ทดสอบ');
  await page.getByTestId('input-email').fill('tor@example.test');
  await page.getByTestId('input-phone').fill('0895550001');
  await page.getByTestId('to-payment').click();

  await expect(page.getByTestId('payment')).toBeVisible();
  await expect(page.getByTestId('pay-due-now')).toContainText('2,160');
  await expect(page.getByTestId('pay-at-hotel')).toContainText('5,040');
  await page.getByTestId('input-card-number').fill('4000 0000 0000 0002');
  await page.getByTestId('input-card-expiry').fill('12/29');
  await page.getByTestId('input-card-cvc').fill('123');
  await page.getByTestId('pay-submit').click();
  await expect(page.getByTestId('msg-pay-error')).toContainText('ไม่มีการตัดเงิน');

  await page.getByTestId('input-card-number').fill('4242 4242 4242 4242');
  await page.getByTestId('pay-submit').click();
  await expect(page.getByTestId('booking-done')).toBeVisible();
  await expect(page.getByTestId('done-code')).toContainText(/SJ-2027-\d{6}/);
  await expect(page.getByTestId('detail-free-cancel')).toContainText('7 มี.ค. 2027 14:00');
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollW).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('US-13 · ช่วง Peak พัก 1 คืนไม่ได้', async ({ page }) => {
  await page.goto('/th/book?checkIn=2027-12-31&checkOut=2028-01-01&adults=2');
  await expect(page.getByText('ช่วงวันที่นี้ต้องพักอย่างน้อย 2 คืน')).toBeVisible();
});

test('US-53 / US-43 · พนักงานต้อนรับกดเช็กเอาต์ แล้วแต้มคุณแนนเข้า 250 + 59 = 309', async ({ page }) => {
  // SJ-2027-200003 คุณแนน อยู่ในห้อง เช็กเอาต์วันนี้ 1 มี.ค. · ค่าห้องหลังส่วนลด ฿5,900 → 59 แต้ม
  await page.request.post('/api/demo/login', { data: { userId: 's:3' } });
  await page.goto('/th/admin/arrivals');
  await page.getByTestId('arrivals-tab-departures').click();
  await page.getByTestId('checkout-SJ-2027-200003').click();
  await expect(page.getByTestId('checkout-SJ-2027-200003')).toHaveCount(0);

  await page.request.post('/api/demo/login', { data: { userId: 'm:1' } });
  const me = await (await page.request.get('/api/me')).json();
  expect(me.points).toBe(309);
});

test('DESIGN §2.3 · ฝ่ายห้องพักเข้าเมนูรายงานไม่ได้', async ({ page }) => {
  await page.request.post('/api/demo/login', { data: { userId: 's:4' } });
  const r = await page.request.get('/api/admin/reports?from=2027-03-01&to=2027-03-31');
  expect(r.status()).toBe(403);
  await page.goto('/th/admin/reports');
  await expect(page.getByText('ไม่มีสิทธิ์เข้าถึง')).toBeVisible();
});
