<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
class User extends Authenticatable
{
    public $timestamps = false;

    protected $fillable = [
        'full_name',
        'email',
        'profile_image',
        'username',
        'password_hash',
        'role',
        'status',
    ];

    protected $hidden = [
        'password_hash',
    ];
}
