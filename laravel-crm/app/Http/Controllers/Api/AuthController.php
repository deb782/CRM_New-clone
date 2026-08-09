<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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
            throw ValidationException::withMessages(['email' => 'Invalid credentials.']);
        }

        $token = $user->createToken('crm')->plainTextToken;
        $user->load('role.permissions');

        return response()->json([
            'token' => $token,
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
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out']);
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

    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
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
