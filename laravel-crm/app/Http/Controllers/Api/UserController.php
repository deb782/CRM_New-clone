<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index()
    {
        return response()->json(['data' => User::with('role')->orderBy('name')->get()]);
    }

    public function roles()
    {
        return response()->json(['data' => Role::withCount('users')->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string',
            'email' => 'required|email|unique:users,email',
            'role_id' => 'required|exists:roles,id',
            'phone' => 'required|string|min:6',
            'department' => 'nullable|string',
        ]);

        // Auto-provisioning: temp password = phone, forced change on first login.
        $tempPassword = $data['phone'];
        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'],
            'role_id' => $data['role_id'],
            'password' => Hash::make($tempPassword),
            'is_active' => true,
            'must_change_password' => true,
        ])->load('role');

        // Credential email (MOCKED until Gmail Workspace SMTP is connected)
        $loginUrl = rtrim(config('app.url'), '/').'/';
        $this->sendCredentialEmail($user, $tempPassword, $loginUrl);

        return response()->json([
            'user' => $user,
            'temp_password' => $tempPassword,
            'login_url' => $loginUrl,
            'credential_text' => "Login: {$loginUrl}\nUser ID: {$user->email}\nTemporary password: {$tempPassword}\n(You'll be asked to set a new password on first login.)",
            'email_status' => 'mocked',
        ], 201);
    }

    private function sendCredentialEmail(User $user, string $tempPassword, string $loginUrl): void
    {
        // MOCK: log the credential email. Swap to real mailer when Gmail SMTP is configured.
        \Illuminate\Support\Facades\Log::info('[MOCK credential email] to '.$user->email.' | role '.($user->role->name ?? '').' | url '.$loginUrl.' | user='.$user->email.' | pass='.$tempPassword);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => 'sometimes|string',
            'role_id' => 'sometimes|exists:roles,id',
            'phone' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
            'password' => 'nullable|string|min:8',
        ]);
        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        $user->update($data);
        return response()->json(['user' => $user->fresh()->load('role')]);
    }
}
