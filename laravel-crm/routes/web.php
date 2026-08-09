<?php

use App\Http\Controllers\Web\PageController;
use Illuminate\Support\Facades\Route;

Route::get('/login', [PageController::class, 'index']);
Route::get('/{any?}', [PageController::class, 'index'])->where('any', '^(?!api).*$');
