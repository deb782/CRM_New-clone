<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Live Chat Widget · Demo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#0b1020;--panel:#141b32;--line:#26304f;--txt:#e8ecf7;--muted:#9aa6c4;--accent:#6c8cff}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;font-family:Inter,system-ui,sans-serif;color:var(--txt);
      background:radial-gradient(1100px 600px at 85% -10%,#1c2748 0%,var(--bg) 55%)}
    .wrap{max-width:820px;margin:0 auto;padding:80px 28px}
    .eyebrow{color:var(--accent);font-size:12px;letter-spacing:.16em;text-transform:uppercase;font-weight:600}
    h1{font-family:Sora,sans-serif;font-size:42px;line-height:1.1;margin:10px 0 14px}
    p.lead{color:var(--muted);font-size:17px;max-width:560px;line-height:1.6}
    .hint{margin-top:40px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px 24px;color:var(--muted);font-size:14px;line-height:1.7}
    .hint b{color:var(--txt)}
    .arrow{position:fixed;bottom:96px;right:34px;color:var(--accent);font-size:14px;font-weight:600;animation:bob 1.4s ease-in-out infinite}
    @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">Website Chat Widget</div>
    <h1>See how prospects turn into leads.</h1>
    <p class="lead">This page has the CRM chat widget installed. Open it, answer a few quick questions, and a brand-new lead lands in your CRM automatically — tagged by source.</p>
    <div class="hint">
      <b>How to install on any site:</b> paste this one line before <code>&lt;/body&gt;</code>:<br><br>
      <code>&lt;script src="{{ url('/widget/chat.js') }}" async&gt;&lt;/script&gt;</code><br><br>
      Partners can add <b>data-ref="THEIR-CODE"</b> to auto-attribute every captured lead (and commission) to them.
    </div>
  </div>
  <div class="arrow" data-testid="chat-demo-arrow">Try it →</div>
  <script src="{{ url('/widget/chat.js') }}" data-title="Find your dream home" async></script>
</body>
</html>
