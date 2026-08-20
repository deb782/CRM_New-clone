const { chromium, request } = require('@playwright/test');

const BASE = 'https://deal-flow-platform.preview.emergentagent.com';
const API = BASE + '/crm-api/v1';
const LEAD = 28;
const DIR = __dirname;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function login(ctx, email, password) {
  const r = await ctx.post(API + '/auth/login', { data: { email, password } });
  const j = await r.json();
  return j.token;
}
async function transition(ctx, token, code) {
  const r = await ctx.post(API + `/journey/leads/${LEAD}/transition`, {
    headers: { Authorization: 'Bearer ' + token },
    data: { code, reason: 'demo dry-run' },
  });
  log('  transition', code, '->', r.status());
  return r.status();
}

(async () => {
  const apiCtx = await request.newContext();
  const tokens = {
    admin: await login(apiCtx, 'admin@crm.local', 'Admin@12345'),
    bde: await login(apiCtx, 'rahul@crm.local', 'Demo@12345'),
    bdm: await login(apiCtx, 'bdm@crm.local', 'Demo@12345'),
    acc: await login(apiCtx, 'accountshead@crm.local', 'Demo@12345'),
  };
  log('tokens ready');

  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  async function actAs(token, hash, { full = false } = {}) {
    await page.goto(BASE + '/#/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => { localStorage.setItem('crm_token', t); localStorage.setItem('crm_notif_popup_seen', '[]'); }, token);
    await page.goto(BASE + '/#' + hash, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(3200);
  }
  async function shot(name, full = true) {
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
    log('  shot', name);
  }
  async function killPopup() { await page.evaluate(() => document.querySelectorAll('.npop__ovl,.npop__stack').forEach(e => e.remove())).catch(() => {}); }

  try {
    // 01 — Enquiry form
    await page.goto(BASE + '/enquiry', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    try {
      const mount = page.locator('#crm-form-mount');
      const txt = mount.locator('input[type=text], input:not([type])');
      if (await txt.count()) await txt.first().fill('Priya Nair');
      const tel = mount.locator('input[type=tel]'); if (await tel.count()) await tel.first().fill('9008007001');
      const em = mount.locator('input[type=email]'); if (await em.count()) await em.first().fill('priya.demo@example.com');
      const ta = mount.locator('textarea'); if (await ta.count()) await ta.first().fill('Interested in a 3BHK garden villa');
    } catch (e) { log('form fill note', e.message); }
    await page.waitForTimeout(500);
    await shot('01_enquiry_form', false);

    // 02 — BDE dashboard (with New Lead popup)
    await actAs(tokens.bde, '/dashboard');
    await shot('02_bde_dashboard', false);

    // 03 — Lead drawer: Stage 1 Not Contacted
    await actAs(tokens.bde, '/leads/' + LEAD);
    await killPopup();
    await page.waitForSelector('[data-testid=lead-header]', { timeout: 8000 }).catch(() => {});
    await shot('03_stage1_not_contacted');

    // Stage 2 — Contacted
    await transition(apiCtx, tokens.admin, 'CONTACTED');
    await actAs(tokens.bde, '/leads/' + LEAD); await killPopup();
    await shot('04_stage2_contacted');

    // Stage 2 — Follow-up 1
    await transition(apiCtx, tokens.admin, 'FOLLOWUP_1');
    await actAs(tokens.bde, '/leads/' + LEAD); await killPopup();
    await shot('05_stage2_followup1');

    // Stage 3 — Converted -> ownership hands to BDM (view as admin to be safe)
    await transition(apiCtx, tokens.admin, 'CONVERTED_OPPORTUNITY');
    await actAs(tokens.admin, '/leads/' + LEAD); await killPopup();
    await shot('06_stage3_converted_owner_bdm');

    // Enter BDM pipeline and walk to pricing sheet
    await transition(apiCtx, tokens.admin, 'OPP_NOT_CONTACTED');
    await transition(apiCtx, tokens.admin, 'OPP_INITIAL_CALL');
    await transition(apiCtx, tokens.admin, 'OPP_SV_POSITIVE');
    await transition(apiCtx, tokens.admin, 'OPP_PRICING_SHEET');
    await actAs(tokens.bdm, '/leads/' + LEAD); await killPopup();
    await shot('07_stage3_pricing_sheet');

    // Negotiation -> Final call
    await transition(apiCtx, tokens.admin, 'OPP_NEGOTIATION');
    await transition(apiCtx, tokens.admin, 'OPP_FINAL_CALL');
    await actAs(tokens.bdm, '/leads/' + LEAD); await killPopup();
    await shot('08_stage3_final_call');

    // Stage 4 — Won -> lock + ownership to post-sales
    await transition(apiCtx, tokens.admin, 'OPP_WON');
    await actAs(tokens.bdm, '/leads/' + LEAD); await killPopup();
    await shot('09_stage4_won_locked');

    // Accounts finance dashboard
    await actAs(tokens.acc, '/dashboard'); await killPopup();
    await shot('10_accounts_dashboard', false);

    // BDE tasks list
    await actAs(tokens.bde, '/tasks'); await killPopup();
    await shot('11_bde_tasks', false);

    log('DONE');
  } catch (e) {
    log('ERROR', e.message);
  } finally {
    await browser.close();
  }
})();
