<?php

use App\Http\Controllers\Web\PageController;
use Illuminate\Support\Facades\Route;

Route::get('/login', [PageController::class, 'index']);

// Public partner referral landing (standalone, no auth)
Route::get('/refer/{code}', function (string $code) {
    $partner = \App\Models\ChannelPartner::where('referral_code', $code)->where('active', true)->first();
    abort_if(! $partner, 404);
    return view('refer', ['partner' => $partner, 'code' => $code]);
});

Route::get('/{any?}', [PageController::class, 'index'])->where('any', '^(?!api).*$');
