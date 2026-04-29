<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Resource extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'title',
        'description',
        'category_id',
        'file_type',
        'keywords_json',
        'author_source',
        'upload_date',
        'status',
        'views',
        'source_mode',
        'resource_url',
        'data_text',
        'stored_filename',
        'original_filename',
        'mime_type',
        'attachments_json',
    ];
}
