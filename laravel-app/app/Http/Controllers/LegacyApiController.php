<?php

namespace App\Http\Controllers;

use App\Support\LegacyApiService;
use Illuminate\Http\Request;

class LegacyApiController extends Controller
{
    public function handle(Request $request, LegacyApiService $service)
    {
        return $service->handle($request);
    }
}
