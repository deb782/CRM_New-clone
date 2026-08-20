<?php

namespace App\Services;

use App\Models\Payment;

class ReceiptService
{
    public function __construct(private ObjectStorage $storage) {}

    /** Build a branded PDF receipt, store it durably, and return the bytes. */
    public function pdf(Payment $payment): string
    {
        $payment->loadMissing(['booking', 'lead']);
        $html = $this->html($payment);

        $dir = sys_get_temp_dir();
        $base = 'rcpt_'.$payment->id.'_'.uniqid();
        $htmlPath = "$dir/$base.html";
        $pdfPath = "$dir/$base.pdf";
        file_put_contents($htmlPath, $html);

        $chrome = is_file('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'chromium';
        $cmd = escapeshellarg($chrome).' --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer '
            .'--virtual-time-budget=8000 --run-all-compositor-stages-before-draw '
            .'--print-to-pdf='.escapeshellarg($pdfPath).' '.escapeshellarg('file://'.$htmlPath).' 2>/dev/null';
        shell_exec($cmd);

        $bytes = is_file($pdfPath) ? file_get_contents($pdfPath) : null;
        @unlink($htmlPath);
        @unlink($pdfPath);
        if (! $bytes) {
            // Fallback: return the HTML so the endpoint still delivers something printable.
            return $html;
        }

        if ($this->storage->enabled()) {
            try {
                $path = $this->storage->put('receipts/'.$payment->receipt_no.'.pdf', $bytes, 'application/pdf');
                $meta = $payment->meta ?? [];
                $meta['receipt_pdf'] = $path;
                $payment->update(['meta' => $meta]);
            } catch (\Throwable $e) { /* durability best-effort */ }
        }
        return $bytes;
    }

    private function html(Payment $p): string
    {
        $logo = public_path('assets/img/agrocorp-mark.png');
        $logoSrc = is_file($logo) ? 'file://'.$logo : '';
        $customer = $p->lead->name ?? 'Customer';
        $ref = $p->booking->booking_ref ?? '—';
        $amount = \App\Support\Money::group((int) $p->amount);
        $date = optional($p->received_at)->format('d M Y, h:i A') ?? now()->format('d M Y');
        $method = ucfirst((string) $p->method);
        $type = ucfirst((string) $p->type);
        $status = ucfirst((string) $p->status);
        $words = ucwords(strtolower($this->words((int) $p->amount)));
        $reference = e($p->reference ?: $p->gateway_ref ?: '—');

        return <<<HTML
<!doctype html><html><head><meta charset="utf-8"><style>
@page { size:A4; margin:0; }
*{ box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body{ margin:0; color:#1c1e16; }
.wrap{ padding:46px 52px; }
.head{ display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #4F5823; padding-bottom:18px; }
.brand{ display:flex; align-items:center; gap:12px; }
.brand img{ height:44px; }
.brand b{ font-size:22px; color:#4F5823; letter-spacing:.01em; }
.doc{ text-align:right; }
.doc .t{ font-size:20px; font-weight:800; letter-spacing:.04em; }
.doc .n{ color:#6b6f5f; font-size:12px; margin-top:2px; }
.hero{ background:#EEF0E2; border-radius:14px; padding:22px 26px; margin:28px 0; display:flex; justify-content:space-between; align-items:center; }
.hero .lbl{ text-transform:uppercase; letter-spacing:.16em; font-size:10px; color:#6b6f5f; }
.hero .amt{ font-size:34px; font-weight:800; color:#39401a; }
.hero .words{ font-size:11px; color:#6b6f5f; margin-top:4px; font-style:italic; }
.badge{ background:#4F5823; color:#fff; border-radius:100px; padding:6px 16px; font-size:12px; font-weight:700; }
table{ width:100%; border-collapse:collapse; margin-top:8px; }
td{ padding:11px 4px; border-bottom:1px solid #e5e7d8; font-size:13px; }
td.k{ color:#6b6f5f; width:38%; }
td.v{ font-weight:600; text-align:right; }
.foot{ margin-top:40px; border-top:1px solid #e5e7d8; padding-top:16px; color:#8a8d7c; font-size:10.5px; display:flex; justify-content:space-between; }
.note{ margin-top:26px; font-size:11px; color:#8a8d7c; }
</style></head><body><div class="wrap">
  <div class="head">
    <div class="brand"><img src="$logoSrc"><b>Agrocorp CRM</b></div>
    <div class="doc"><div class="t">PAYMENT RECEIPT</div><div class="n">No. {$p->receipt_no}</div></div>
  </div>
  <div class="hero">
    <div><div class="lbl">Amount received</div><div class="amt">&#8377; $amount</div><div class="words">Rupees $words only</div></div>
    <div class="badge">$status</div>
  </div>
  <table>
    <tr><td class="k">Received from</td><td class="v">$customer</td></tr>
    <tr><td class="k">Booking reference</td><td class="v">$ref</td></tr>
    <tr><td class="k">Payment type</td><td class="v">$type</td></tr>
    <tr><td class="k">Payment method</td><td class="v">$method</td></tr>
    <tr><td class="k">Transaction / reference</td><td class="v">$reference</td></tr>
    <tr><td class="k">Date &amp; time</td><td class="v">$date</td></tr>
  </table>
  <div class="note">This is a system-generated acknowledgement of payment received. Subject to realisation and reconciliation as per company policy.</div>
  <div class="foot"><span>Agrocorp &mdash; real estate. reimagined.</span><span>Generated by Agrocorp CRM</span></div>
</div></body></html>
HTML;
    }

    private function words(int $n): string
    {
        if ($n === 0) return 'zero';
        $units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        $tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        $two = function ($x) use ($units, $tens) {
            if ($x < 20) return $units[$x];
            return trim($tens[intdiv($x, 10)].' '.$units[$x % 10]);
        };
        $three = function ($x) use ($units, $two) {
            $h = intdiv($x, 100); $r = $x % 100;
            return trim(($h ? $units[$h].' hundred ' : '').$two($r));
        };
        $out = '';
        $crore = intdiv($n, 10000000); $n %= 10000000;
        $lakh = intdiv($n, 100000); $n %= 100000;
        $thousand = intdiv($n, 1000); $n %= 1000;
        if ($crore) $out .= $two($crore).' crore ';
        if ($lakh) $out .= $two($lakh).' lakh ';
        if ($thousand) $out .= $two($thousand).' thousand ';
        if ($n) $out .= $three($n);
        return trim($out);
    }
}
