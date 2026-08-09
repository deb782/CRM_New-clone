<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Refer a lead · {{ $partner->name }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0b1020; --panel:#141b32; --line:#26304f; --txt:#e8ecf7; --muted:#9aa6c4; --accent:#6c8cff; --won:#38d39f; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font-family:Inter,system-ui,sans-serif; color:var(--txt);
      background:radial-gradient(1200px 600px at 80% -10%, #1c2748 0%, var(--bg) 55%); display:flex; align-items:center; justify-content:center; padding:28px; }
    .card { width:100%; max-width:460px; background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:34px 30px; box-shadow:0 30px 80px rgba(0,0,0,.45); }
    .eyebrow { color:var(--accent); font-size:12px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; }
    h1 { font-family:Sora,sans-serif; font-size:24px; margin:6px 0 4px; }
    p.sub { color:var(--muted); font-size:14px; margin:0 0 22px; }
    label { display:block; font-size:12px; color:var(--muted); margin:14px 0 6px; }
    input, textarea { width:100%; background:#0e1428; border:1px solid var(--line); border-radius:10px; color:var(--txt); padding:12px 13px; font-size:14px; font-family:inherit; }
    input:focus, textarea:focus { outline:none; border-color:var(--accent); }
    button { width:100%; margin-top:22px; background:var(--accent); color:#fff; border:0; border-radius:10px; padding:13px; font-size:15px; font-weight:600; cursor:pointer; transition:transform .12s ease, background .2s ease; }
    button:hover { background:#7d9aff; transform:translateY(-1px); }
    button:disabled { opacity:.6; cursor:default; transform:none; }
    .ok { text-align:center; padding:16px 0; }
    .ok .tick { width:56px; height:56px; border-radius:50%; background:rgba(56,211,159,.15); color:var(--won); display:flex; align-items:center; justify-content:center; font-size:28px; margin:0 auto 14px; }
    .err { color:#ff8090; font-size:13px; margin-top:12px; min-height:16px; }
    .foot { color:var(--muted); font-size:12px; text-align:center; margin-top:18px; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="eyebrow">Referred by {{ $partner->company ?: $partner->name }}</div>
    <h1>Interested in a new home?</h1>
    <p class="sub">Share your details and our team will reach out with the best options and offers.</p>
    <form id="f" data-testid="refer-form">
      <label>Full name *</label>
      <input name="name" required data-testid="refer-name" placeholder="Your name">
      <label>Phone *</label>
      <input name="phone" required data-testid="refer-phone" placeholder="10-digit mobile">
      <label>Email</label>
      <input name="email" type="email" data-testid="refer-email" placeholder="you@example.com">
      <label>What are you looking for?</label>
      <textarea name="message" rows="3" data-testid="refer-message" placeholder="Budget, location, unit type…"></textarea>
      <div class="err" id="err"></div>
      <button type="submit" id="btn" data-testid="refer-submit">Submit my details</button>
    </form>
    <div class="foot">Powered by your CRM · Referral {{ $code }}</div>
  </div>
  <script>
    const code = @json($code);
    const f = document.getElementById('f'), btn = document.getElementById('btn'), err = document.getElementById('err');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true; btn.textContent = 'Submitting…';
      const body = Object.fromEntries(new FormData(f).entries());
      try {
        const r = await fetch('/api/v1/public/refer/' + encodeURIComponent(code), {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'Something went wrong');
        document.getElementById('card').innerHTML =
          '<div class="ok" data-testid="refer-success"><div class="tick">✓</div><h1>Thank you!</h1><p class="sub">' + d.message + '</p></div>';
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Submit my details'; }
    });
  </script>
</body>
</html>
