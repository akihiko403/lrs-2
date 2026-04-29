<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->unsignedInteger('id', true);
                $table->string('full_name', 140);
                $table->string('email', 190)->nullable();
                $table->string('profile_image')->nullable();
                $table->string('username', 60)->unique();
                $table->string('password_hash');
                $table->enum('role', ['Administrator', 'Encoder']);
                $table->enum('status', ['Active', 'Inactive'])->default('Active');
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
