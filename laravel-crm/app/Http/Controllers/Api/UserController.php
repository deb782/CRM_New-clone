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
            'password' => 'required|string|min:8',
            'role_id' => 'required|exists:roles,id',
            'phone' => 'nullable|string',
        ]);
        $data['password'] = Hash::make($data['password']);
        return response()->json(['user' => User::create($data)->load('role')], 201);
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
