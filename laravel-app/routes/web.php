<?php

use App\Http\Controllers\LegacyApiController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'app');
Route::match(['GET', 'POST'], '/api.php', [LegacyApiController::class, 'handle']);
