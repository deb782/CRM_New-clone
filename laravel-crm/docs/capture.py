import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:8000"
OUT = "/app/laravel-crm/docs/screenshots"

ROLES = {
    "admin@crm.local": ("Admin@12345", [
        ("dashboard","admin_dashboard"),("users","admin_users"),("access","admin_access"),
        ("integrations","admin_integrations"),("workflows","admin_workflows"),
        ("health","admin_health"),("audit","admin_audit"),("tasks","admin_tasks"),
    ]),
    "priya@crm.local": ("Demo@12345", [
        ("dashboard","sales_dashboard"),("slaBoard","sales_sla"),("leads","sales_leads"),
        ("pipeline","sales_pipeline"),("callList","sales_calllist"),("visits","sales_visits"),
        ("inventory","sales_inventory"),("approvals","sales_approvals"),("inbox","sales_inbox"),
        ("tasks","sales_tasks"),
    ]),
    "accountshead@crm.local": ("Demo@12345", [
        ("dashboard","accounts_dashboard"),("collections","accounts_collections"),
        ("demands","accounts_demands"),("bookings","accounts_bookings"),
    ]),
    "legalhead@crm.local": ("Demo@12345", [
        ("dashboard","legal_dashboard"),("bookings","legal_bookings"),("leads","legal_leads"),
    ]),
    "crmhead@crm.local": ("Demo@12345", [
        ("dashboard","crm_dashboard"),("inbox","crm_inbox"),
        ("collections","crm_collections"),("leads","crm_leads"),
    ]),
    "partner@crm.local": ("Demo@12345", [
        ("portal","partner_portal"),
    ]),
}

async def login(page, email, pw):
    await page.goto(BASE + "/#/login", wait_until="networkidle")
    await page.wait_for_timeout(1200)
    await page.fill("input[type='email']", email)
    await page.fill("input[type='password']", pw)
    await page.click("button:has-text('Sign in')")
    await page.wait_for_timeout(3500)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                           args=["--no-sandbox","--disable-dev-shm-usage"])
        for email,(pw,screens) in ROLES.items():
            ctx = await browser.new_context(viewport={"width":1440,"height":900}, device_scale_factor=2)
            page = await ctx.new_page()
            try:
                await login(page, email, pw)
                print("LOGIN", email, page.url, flush=True)
                # capture login-style brand once (admin run)
                for route,name in screens:
                    try:
                        await page.goto(BASE + "/#/"+route, wait_until="networkidle")
                        await page.wait_for_timeout(2600)
                        await page.screenshot(path=f"{OUT}/{name}.png", full_page=False)
                        print("OK", name, flush=True)
                    except Exception as e:
                        print("FAIL", name, str(e)[:80], flush=True)
            except Exception as e:
                print("LOGINERR", email, str(e)[:120], flush=True)
            await ctx.close()
        # capture login brand page (logged out)
        ctx = await browser.new_context(viewport={"width":1440,"height":900}, device_scale_factor=2)
        page = await ctx.new_page()
        try:
            await page.goto(BASE + "/#/login", wait_until="networkidle")
            await page.wait_for_timeout(1500)
            await page.screenshot(path=f"{OUT}/login_brand.png", full_page=False)
            print("OK login_brand", flush=True)
        except Exception as e:
            print("FAIL login_brand", str(e)[:80], flush=True)
        await ctx.close()
        await browser.close()
    print("DONE", flush=True)

asyncio.run(main())
