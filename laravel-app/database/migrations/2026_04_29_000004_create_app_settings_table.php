<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('app_settings')) {
            Schema::create('app_settings', function (Blueprint $table) {
                $table->string('setting_key', 120)->primary();
                $table->text('setting_value');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
    }
};
