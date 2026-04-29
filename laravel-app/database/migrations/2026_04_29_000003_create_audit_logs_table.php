<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->unsignedBigInteger('id', true);
                $table->unsignedInteger('user_id')->nullable();
                $table->string('actor_name', 140);
                $table->string('actor_username', 60);
                $table->string('actor_role', 40);
                $table->string('action_type', 80);
                $table->string('entity_type', 80);
                $table->text('description');
                $table->unsignedInteger('target_id')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index('created_at', 'idx_audit_logs_created_at');
                $table->index('user_id', 'idx_audit_logs_user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
