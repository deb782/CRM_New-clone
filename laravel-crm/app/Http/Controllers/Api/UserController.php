<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index()
    {
        return response()->json(['data' => User::with('role')->orderBy('name')->get()]);
    }

    public function roles()
    {
        $defaults = config('role_defaults', []);
        $roles = Role::withCount('users')->with('permissions:id,key,label,group')->get();
        $roles->each(function ($r) use ($defaults) {
            $r->setAttribute('default_keys', $r->slug === 'admin' ? ['*'] : ($defaults[$r->slug] ?? []));
        });

        return response()->json(['data' => $roles]);
    }

    public function permissions()
    {
        return response()->json(['data' => Permission::orderBy('group')->orderBy('id')->get(['id', 'key', 'label', 'group'])]);
    }

    public function resetPermissions(Request $request, Role $role)
    {
        if ($role->slug === 'admin') {
            return response()->json(['message' => 'Super Admin always has full access.'], 422);
        }
        $keys = config('role_defaults.'.$role->slug, []);
        $ids = Permission::whereIn('key', $keys)->pluck('id')->all();
        $role->permissions()->sync($ids);
        \Illuminate\Support\Facades\Log::info('[RBAC] role "'.$role->slug.'" reset to default by '.($request->user()->email ?? 'system'));

        return response()->json(['role' => $role->fresh()->loadCount('users')->load('permissions:id,key,label,group')]);
    }

    public function updateRolePermissions(Request $request, Role $role)
    {
        if ($role->slug === 'admin') {
            return response()->json(['message' => 'Super Admin always has full access and cannot be restricted.'], 422);
        }
        $data = $request->validate([
            'permission_ids' => 'present|array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);
        $role->permissions()->sync($data['permission_ids']);
        \Illuminate\Support\Facades\Log::info('[RBAC] role "'.$role->slug.'" permissions updated by '.($request->user()->email ?? 'system').' → '.count($data['permission_ids']).' perms');

        return response()->json(['role' => $role->fresh()->loadCount('users')->load('permissions:id,key,label,group')]);
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
        // Pass plain password; the User model's 'hashed' cast hashes it exactly once.
        $tempPassword = $data['phone'];
        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'phone' => $data['phone'],
            'role_id' => $data['role_id'],
            'password' => $tempPassword,
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
        // Pass plain password; the User model's 'hashed' cast hashes it exactly once.
        if (empty($data['password'])) {
            unset($data['password']);
        }
        $user->update($data);
        return response()->json(['user' => $user->fresh()->load('role')]);
    }
}
