import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveDist } from './_server.mjs';

const { server, origin } = serveDist();
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const login = async target => {
    await target.goto(origin + '/admin/#admin-assistant');
    await target.fill('[name=p]', '1234');
    await target.click('#lfGo');
    await target.waitForSelector('#asForm');
  };
  await login(page);
  assert.equal(await page.locator('.side a[href="#admin-assistant"]').textContent(), 'المساعد الذكي');
  await page.click('#asAdd');
  await page.fill('#asTitle', 'فرصة التسجيل الخاصة');
  await page.fill('#asKeywords', 'فرصة التسجيل الخاصة');
  await page.fill('#asAnswer', 'رد معتمد من مركز سما');
  await page.click('#asSave');
  await page.waitForFunction(() => document.querySelector('#asSaved')?.textContent === 'تم حفظ الرد');
  await page.fill('#asQuestion', 'فرصة التسجيل الخاصة');
  await page.locator('#asPreview button').click();
  assert.match(await page.locator('#asResult').textContent(), /رد معتمد من مركز سما/);
  const other = await context.newPage();
  await login(other);
  await other.locator('[data-response]').filter({ hasText: 'فرصة التسجيل الخاصة' }).click();
  await page.fill('#asAnswer', 'تعديل لم يُحفظ');
  await other.fill('#asAnswer', 'تعديل محفوظ من جلسة أخرى');
  await other.click('#asSave');
  await other.waitForFunction(() => document.querySelector('#asSaved')?.textContent === 'تم حفظ الرد');
  await page.waitForTimeout(1700);
  assert.equal(await page.inputValue('#asAnswer'), 'تعديل لم يُحفظ', 'a remote update preserves the current edit');
  await page.click('#asSave');
  await page.waitForFunction(() => /تم تعديل الرد/.test(document.querySelector('#asError')?.textContent || ''));
  assert.equal(await page.inputValue('#asAnswer'), 'تعديل لم يُحفظ', 'version conflicts preserve the draft');
  await page.goto(origin + '/#register');
  await page.click('#assistantToggle');
  await page.fill('#assistantQuestion', 'فرصة التسجيل الخاصة');
  await page.locator('#assistantAsk button').click();
  await page.waitForFunction(() => document.querySelector('#assistantMessages')?.textContent.includes('تعديل محفوظ من جلسة أخرى'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS assistant admin CRUD, preview, cross-tab draft protection, version conflicts and public reply');
} finally { await browser.close(); server.close(); }
