<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuthAuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();
        if (! $user || ! Hash::check($data['password'], $user->password) || ! $user->is_active) {
            AuthAuditLog::record('login_failed', $user && $user->is_active ? null : null, $request, $data['email'], [
                'reason' => (! $user || ! Hash::check($data['password'], $user->password)) ? 'bad_credentials' : 'inactive',
            ]);
            throw ValidationException::withMessages(['email' => 'Invalid credentials.']);
        }

        // Fresh token per login (prevents fixation); expires after the inactivity window.
        $ttl = (int) config('sanctum.token_ttl', 60);
        $new = $user->createToken('crm', ['*'], now()->addMinutes($ttl));
        $new->accessToken->forceFill([
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 500),
        ])->save();

        AuthAuditLog::record('login', $user, $request);
        $user->load('role.permissions');

        return response()->json([
            'token' => $new->plainTextToken,
            'user' => $this->userPayload($user),
        ]);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('role.permissions');
        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function logout(Request $request)
    {
        AuthAuditLog::record('logout', $request->user(), $request);
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
    }

    /** Revoke every token for the current user (log out of all devices). */
    public function logoutAll(Request $request)
    {
        $user = $request->user();
        AuthAuditLog::record('logout_all', $user, $request);
        $user->tokens()->delete();
        return response()->json(['message' => 'Logged out of all devices']);
    }

    /** List the current user's active sessions (one per token). */
    public function sessions(Request $request)
    {
        $currentId = $request->user()->currentAccessToken()->id;
        $rows = $request->user()->tokens()->latest('last_used_at')->get()->map(fn ($t) => [
            'id' => $t->id,
            'ip_address' => $t->ip_address,
            'user_agent' => $t->user_agent,
            'last_used_at' => $t->last_used_at,
            'created_at' => $t->created_at,
            'expires_at' => $t->expires_at,
            'current' => $t->id === $currentId,
        ]);
        return response()->json(['data' => $rows]);
    }

    /** Revoke a single session/device by token id. */
    public function revokeSession(Request $request, int $id)
    {
        $token = $request->user()->tokens()->whereKey($id)->first();
        if (! $token) {
            return response()->json(['message' => 'Session not found.'], 404);
        }
        AuthAuditLog::record('session_revoked', $request->user(), $request, null, ['token_id' => $id]);
        $token->delete();
        return response()->json(['message' => 'Session revoked']);
    }

    /** Send a password-reset link. Always responds success to avoid user enumeration. */
    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => 'required|email']);
        $user = User::where('email', $data['email'])->first();
        if ($user && $user->is_active) {
            $plain = Str::random(64);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => Hash::make($plain), 'created_at' => now()]
            );
            $link = rtrim((string) config('app.url'), '/').'/#/reset?token='.$plain.'&email='.urlencode($user->email);
            AuthAuditLog::record('password_reset_requested', $user, $request);
            try {
                Mail::raw(
                    "Hello ".$user->name.",\n\nWe received a request to reset your Agrocorp CRM password.\n".
                    "Reset it here (valid for 60 minutes):\n".$link."\n\nIf you didn't request this, you can ignore this email.",
                    fn ($m) => $m->to($user->email)->subject('Reset your Agrocorp CRM password')
                );
            } catch (\Throwable $e) {
                \Log::warning('password reset mail failed: '.$e->getMessage());
            }
        }
        return response()->json(['message' => 'If that email exists, a reset link has been sent.']);
    }

    /** Complete a password reset. Invalidates all existing sessions on success. */
    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);
        $row = DB::table('password_reset_tokens')->where('email', $data['email'])->first();
        if (! $row || ! Hash::check($data['token'], $row->token)) {
            throw ValidationException::withMessages(['token' => 'This reset link is invalid.']);
        }
        if (now()->diffInMinutes($row->created_at) > 60) {
            DB::table('password_reset_tokens')->where('email', $data['email'])->delete();
            throw ValidationException::withMessages(['token' => 'This reset link has expired. Please request a new one.']);
        }
        $user = User::where('email', $data['email'])->firstOrFail();
        $user->forceFill(['password' => $data['password'], 'must_change_password' => false])->save();
        $user->tokens()->delete(); // invalidate all sessions
        DB::table('password_reset_tokens')->where('email', $data['email'])->delete();
        AuthAuditLog::record('password_reset', $user, $request);

        return response()->json(['message' => 'Password updated. Please sign in with your new password.']);
    }

    /** Super-admin only: preview the app as any user (Preview Roles). */
    public function impersonate(Request $request)
    {
        if ($request->user()->role?->slug !== 'admin') {
            return response()->json(['message' => 'Only the Super Admin can preview roles.'], 403);
        }
        $data = $request->validate(['user_id' => 'required|exists:users,id']);
        $target = User::with('role.permissions')->findOrFail($data['user_id']);
        \Illuminate\Support\Facades\Log::info('[preview-roles] impersonation', ['by' => $request->user()->id, 'as' => $target->id, 'role' => $target->role?->slug]);
        $token = $target->createToken('crm-preview')->plainTextToken;

        return response()->json(['token' => $token, 'user' => $this->userPayload($target)]);
    }

    /** Change own password. Forced first-login change skips the current-password check. */
    public function changePassword(Request $request)
    {
        $user = $request->user();
        $rules = ['new_password' => 'required|string|min:8|confirmed'];
        if (! $user->must_change_password) {
            $rules['current_password'] = 'required|string';
        }
        $data = $request->validate($rules);

        if (! $user->must_change_password && ! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Current password is incorrect.']);
        }

        $user->forceFill([
            'password' => $data['new_password'],
            'must_change_password' => false,
        ])->save();

        return response()->json(['user' => $this->userPayload($user->fresh()->load('role.permissions'))]);
    }

    /** Update own profile (name, phone, avatar color, notification preferences). */
    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => 'sometimes|string|max:255',
            'phone' => 'nullable|string|max:30',
            'avatar_color' => 'nullable|string|max:20',
            'preferences' => 'nullable|array',
        ]);
        $user->fill($data)->save();

        return response()->json(['user' => $this->userPayload($user->fresh()->load('role.permissions'))]);
    }

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'avatar_color' => $user->avatar_color,
            'preferences' => $user->preferences ?: (object) [],
            'role' => $user->role?->slug,
            'role_name' => $user->role?->name,
            'department' => $user->role?->department,
            'tier' => $user->role?->tier,
            'must_change_password' => (bool) $user->must_change_password,
            'permissions' => $user->role?->slug === 'admin'
                ? ['*']
                : ($user->role?->permissions->pluck('key')->all() ?? []),
        ];
    }
}
