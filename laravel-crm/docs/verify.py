import asyncio
from playwright.async_api import async_playwright
BASE="http://localhost:8000"; OUT="/app/laravel-crm/docs/screenshots"
async def login(page,email,pw):
    await page.goto(BASE+"/#/login", wait_until="networkidle"); await page.wait_for_timeout(1200)
    await page.fill("input[type='email']",email); await page.fill("input[type='password']",pw)
    await page.click("button:has-text('Sign in')"); await page.wait_for_timeout(3500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox","--disable-dev-shm-usage"])
        ctx=await b.new_context(viewport={"width":1440,"height":900},device_scale_factor=2); page=await ctx.new_page()
        await login(page,"admin@crm.local","Admin@12345"); print("url",page.url)
        # Reports
        await page.goto(BASE+"/#/reports", wait_until="networkidle"); await page.wait_for_timeout(3000)
        await page.screenshot(path=OUT+"/feat_reports_sales.png", full_page=False); print("reports sales")
        # financial tab
        try:
            await page.click("[data-testid='report-tab-financial']"); await page.wait_for_timeout(2500)
            await page.screenshot(path=OUT+"/feat_reports_financial.png", full_page=False); print("reports financial")
        except Exception as e: print("fin tab fail",str(e)[:80])
        # Bell
        try:
            await page.click("[data-testid='notif-bell']"); await page.wait_for_timeout(1500)
            await page.screenshot(path=OUT+"/feat_notifications.png", full_page=False); print("bell")
        except Exception as e: print("bell fail",str(e)[:80])
        await ctx.close(); await b.close()
asyncio.run(main())
