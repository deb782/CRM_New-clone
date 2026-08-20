<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Enquire · Agrocorp</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--olive:#4F5823;--olive-2:#8BA43B;--bg:#F5F5F2;--ink:#111;--muted:#6b7280;--line:#E7E7E1}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;font-family:Manrope,system-ui,sans-serif;color:var(--ink);
      background:radial-gradient(900px 500px at 15% -10%,#EAF0D8 0%,var(--bg) 55%)}
    .wrap{max-width:1040px;margin:0 auto;padding:64px 24px;display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
    @media(max-width:820px){.wrap{grid-template-columns:1fr;padding:40px 20px;gap:28px}}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:26px}
    .brand img{height:40px;width:auto}
    .brand b{font-size:20px;font-weight:800;letter-spacing:-.01em}
    .eyebrow{color:var(--olive);font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:800}
    h1{font-size:44px;line-height:1.05;margin:12px 0 16px;letter-spacing:-.02em}
    p.lead{color:var(--muted);font-size:17px;max-width:460px;line-height:1.6}
    .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:26px}
    .chip{background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;color:#333}
    .chip i{color:var(--olive-2);margin-right:6px}
    /* form-embed.js styles its own form; we just give it a card frame */
    #crm-form-mount form{border-radius:18px !important;border:1px solid var(--line) !important;box-shadow:0 18px 50px rgba(79,88,35,.10) !important;padding:28px !important}
    #crm-form-mount button[type=submit]{background:var(--olive) !important}
  </style>
</head>
<body>
  <div class="wrap">
    <div>
      <div class="brand">
        <img src="{{ asset('assets/img/agrocorp-logo.webp') }}" alt="Agrocorp" onerror="this.style.display='none'">
        <b>Agrocorp</b>
      </div>
      <div class="eyebrow">Book your visit</div>
      <h1>Find your perfect plot with Agrocorp.</h1>
      <p class="lead">Share a few details and our advisor will reach out with brochures, pricing and a site-visit slot that suits you.</p>
      <div class="chips">
        <span class="chip"><i class="fa-solid fa-leaf"></i>Premium locations</span>
        <span class="chip"><i class="fa-solid fa-shield"></i>RERA compliant</span>
        <span class="chip"><i class="fa-solid fa-headset"></i>Personal advisor</span>
      </div>
    </div>
    <div>
      <!-- form-embed.js renders the CRM website-lead form here -->
      <div id="crm-form-mount" data-crm-form="website-lead"></div>
    </div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/js/all.min.js" defer></script>
  <script src="{{ asset('assets/js/form-embed.js') }}" async></script>
</body>
</html>
