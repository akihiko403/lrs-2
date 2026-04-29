<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('resources')) {
            Schema::create('resources', function (Blueprint $table) {
                $table->unsignedInteger('id', true);
                $table->string('title');
                $table->text('description');
                $table->unsignedInteger('category_id');
                $table->enum('file_type', ['PDF', 'Video', 'Data']);
                $table->longText('keywords_json');
                $table->string('author_source');
                $table->date('upload_date');
                $table->enum('status', ['Pending Review', 'Active', 'Inactive'])->default('Active');
                $table->unsignedInteger('views')->default(0);
                $table->enum('source_mode', ['url', 'upload', 'text'])->default('url');
                $table->text('resource_url')->nullable();
                $table->longText('data_text')->nullable();
                $table->string('stored_filename')->nullable();
                $table->string('original_filename')->nullable();
                $table->string('mime_type', 120)->nullable();
                $table->longText('attachments_json')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->foreign('category_id')->references('id')->on('categories')->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('resources');
    }
};
