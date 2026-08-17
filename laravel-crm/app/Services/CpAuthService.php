<?php

namespace App\Services;

use App\Models\ChannelPartner;
use App\Models\CpPasswordReset;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class CpAuthService
{
    /** Generate the next CP code, e.g. VV/CP/072. */
    public function nextCpCode(): string
    {
        $last = ChannelPartner::whereNotNull('cp_code')->orderByDesc('id')->value('cp_code');
        $n = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $n = (int) $m[1] + 1;
        }
        return 'VV/CP/' . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
    }

    /** Admin invites a partner: create record + temp password, email credentials. */
    public function invite(array $data): array
    {
        $temp = $this->randomPassword();
        $partner = ChannelPartner::create($data + [
            'cp_code' => $this->nextCpCode(),
            'password_hash' => Hash::make($temp),
            'status' => 'approved',
            'active' => true,
            'must_change_password' => true,
            'kyc_status' => 'incomplete',
        ]);
        $this->emailCredentials($partner, $temp);
        return ['partner' => $partner, 'temp_password' => $temp];
    }

    public function attemptLogin(string $email, string $password): ChannelPartner
    {
        $partner = ChannelPartner::where('contact_email', strtolower(trim($email)))->first();
        if (! $partner || ! $partner->password_hash || ! Hash::check($password, $partner->password_hash)) {
            abort(401, 'Invalid email or password.');
        }
        if ($partner->status !== 'approved') {
            abort(403, 'Your account is ' . $partner->status . '. Please contact support.');
        }
        $partner->forceFill(['last_login_at' => now()])->save();
        return $partner;
    }

    public function issueToken(ChannelPartner $partner): string
    {
        return $partner->createToken('cp-portal', ['cp'])->plainTextToken;
    }

    public function changePassword(ChannelPartner $partner, string $new): void
    {
        $partner->forceFill(['password_hash' => Hash::make($new), 'must_change_password' => false])->save();
    }

    public function startReset(string $email): void
    {
        $partner = ChannelPartner::where('contact_email', strtolower(trim($email)))->first();
        if (! $partner) {
            return; // do not leak existence
        }
        $token = Str::random(48);
        CpPasswordReset::create([
            'channel_partner_id' => $partner->id,
            'token' => hash('sha256', $token),
            'expires_at' => now()->addHour(),
        ]);
        $link = rtrim(config('app.url'), '/') . '/partner#/reset?token=' . $token . '&email=' . urlencode($partner->contact_email);
        $this->mail($partner->contact_email, 'Reset your partner portal password',
            "Hello {$partner->contact_name},<br><br>Reset your Channel Partner Portal password using the link below (valid 1 hour):<br><a href=\"$link\">$link</a>");
    }

    public function completeReset(string $email, string $token, string $newPassword): void
    {
        $partner = ChannelPartner::where('contact_email', strtolower(trim($email)))->first();
        abort_if(! $partner, 400, 'Invalid reset request.');
        $row = CpPasswordReset::where('channel_partner_id', $partner->id)
            ->where('token', hash('sha256', $token))
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->latest()->first();
        abort_if(! $row, 400, 'Reset link is invalid or expired.');
        $partner->forceFill(['password_hash' => Hash::make($newPassword), 'must_change_password' => false])->save();
        $row->forceFill(['used_at' => now()])->save();
    }

    public function payload(ChannelPartner $p): array
    {
        return [
            'id' => $p->id,
            'cp_code' => $p->cp_code,
            'partner_name' => $p->name,
            'company' => $p->company,
            'contact_name' => $p->contact_name,
            'contact_email' => $p->contact_email,
            'status' => $p->status,
            'kyc_status' => $p->kyc_status,
            'must_change_password' => (bool) $p->must_change_password,
            'commission_rate' => $p->commission_rate,
        ];
    }

    private function emailCredentials(ChannelPartner $partner, string $temp): void
    {
        $link = rtrim(config('app.url'), '/') . '/partner';
        $this->mail($partner->contact_email, 'Your Channel Partner Portal credentials',
            "Welcome {$partner->contact_name},<br><br>Your Channel Partner account has been created.<br><br>"
            . "<b>Partner ID:</b> {$partner->cp_code}<br>"
            . "<b>Login:</b> <a href=\"$link\">$link</a><br>"
            . "<b>Email:</b> {$partner->contact_email}<br>"
            . "<b>Temporary password:</b> {$temp}<br><br>"
            . "You will be asked to change this password on first login.");
    }

    private function mail(string $to, string $subject, string $html): void
    {
        try {
            Mail::html($html, function ($m) use ($to, $subject) {
                $m->to($to)->subject($subject);
            });
        } catch (\Throwable $e) {
            Log::warning('CP mail failed: ' . $e->getMessage());
        }
    }

    private function randomPassword(int $len = 10): string
    {
        $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
        $out = '';
        for ($i = 0; $i < $len; $i++) {
            $out .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $out;
    }
}
