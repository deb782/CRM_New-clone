<?php

namespace App\Http\Controllers\Api\Cp;

use App\Http\Controllers\Controller;
use App\Models\ChannelPartner;
use App\Services\CpAuthService;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private CpAuthService $svc) {}

    public function login(Request $request)
    {
        $data = $request->validate(['email' => 'required|email', 'password' => 'required|string']);
        $partner = $this->svc->attemptLogin($data['email'], $data['password']);
        return response()->json([
            'token' => $this->svc->issueToken($partner),
            'partner' => $this->svc->payload($partner),
        ]);
    }

    public function me(Request $request)
    {
        return response()->json(['partner' => $this->svc->payload($request->attributes->get('cp'))]);
    }

    public function logout(Request $request)
    {
        $token = \Laravel\Sanctum\PersonalAccessToken::findToken($request->bearerToken() ?? '');
        $token?->delete();
        return response()->json(['message' => 'Logged out']);
    }

    public function changePassword(Request $request)
    {
        $data = $request->validate(['password' => 'required|string|min:8|confirmed']);
        $this->svc->changePassword($request->attributes->get('cp'), $data['password']);
        return response()->json(['message' => 'Password updated']);
    }

    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => 'required|email']);
        $this->svc->startReset($data['email']);
        return response()->json(['message' => 'If that email exists, a reset link has been sent.']);
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);
        $this->svc->completeReset($data['email'], $data['token'], $data['password']);
        return response()->json(['message' => 'Password reset. You can now sign in.']);
    }
}
