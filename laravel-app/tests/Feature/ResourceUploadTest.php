<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ResourceUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_upload_a_new_resource_file(): void
    {
        $categoryId = (int) \DB::table('categories')->insertGetId([
            'slug' => 'sample-category',
            'name' => 'Sample Category',
            'description' => 'Category used for upload testing.',
        ]);

        session([
            'user' => [
                'id' => 1,
                'full_name' => 'Encoder User',
                'email' => 'encoder@example.com',
                'username' => 'encoder',
                'role' => 'Encoder',
                'status' => 'Active',
            ],
        ]);

        $response = $this->post('/api.php?action=save_resource', [
            'title' => 'Uploaded PDF Resource',
            'description' => 'A test resource upload.',
            'categoryId' => $categoryId,
            'keywords' => 'pdf,test',
            'authorSource' => 'QA',
            'uploadDate' => '2026-04-29',
            'uploadFile' => [
                UploadedFile::fake()->create('learning-resource.pdf', 128, 'application/pdf'),
            ],
        ]);

        $response->assertOk()->assertJson(['ok' => true]);

        $this->assertDatabaseHas('resources', [
            'title' => 'Uploaded PDF Resource',
            'file_type' => 'PDF',
            'source_mode' => 'upload',
            'original_filename' => 'learning-resource.pdf',
        ]);
    }
}
