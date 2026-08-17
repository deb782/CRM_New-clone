import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8000"
OUT = "/app/laravel-crm/docs/screenshots"

SHOTS = [
    ("integrations", "demo_integrations"),
    ("waTemplates", "demo_templates"),
    ("waFlows", "demo_bots"),
    ("leads", "demo_leads"),
    ("inventory", "demo_inventory"),
    ("pipeline", "demo_pipeline"),
    ("dashboard", "demo_dashboard"),
    ("users", "demo_users"),
]

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
                                           args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = await ctx.new_page()
        await login(page, "admin@crm.local", "Admin@12345")
        print("LOGIN", page.url, flush=True)
        for route, name in SHOTS:
            try:
                await page.goto(BASE + "/#/" + route, wait_until="networkidle")
                await page.wait_for_timeout(2600)
                await page.screenshot(path=f"{OUT}/{name}.png", full_page=False)
                print("OK", name, flush=True)
            except Exception as e:
                print("FAIL", name, str(e)[:80], flush=True)
        # open a lead to capture the Lead Cockpit
        try:
            await page.goto(BASE + "/#/leads", wait_until="networkidle")
            await page.wait_for_timeout(2500)
            card = await page.query_selector("[data-testid^='lead-row-'], .lead-card, tbody tr")
            if card:
                await card.click()
                await page.wait_for_timeout(3000)
                await page.screenshot(path=f"{OUT}/demo_leadcockpit.png", full_page=False)
                print("OK demo_leadcockpit", flush=True)
        except Exception as e:
            print("FAIL leadcockpit", str(e)[:80], flush=True)
        await ctx.close()
        await browser.close()
    print("DONE", flush=True)

asyncio.run(main())
