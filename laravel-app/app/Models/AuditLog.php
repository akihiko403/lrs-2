<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'actor_name',
        'actor_username',
        'actor_role',
        'action_type',
        'entity_type',
        'description',
        'target_id',
    ];
}
