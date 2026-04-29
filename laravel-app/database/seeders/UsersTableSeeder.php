<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UsersTableSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            [
                'full_name' => 'Marina Santos',
                'email' => 'admin@schooloffisheries.local',
                'profile_image' => null,
                'username' => 'admin',
                'password_hash' => password_hash('admin123', PASSWORD_DEFAULT),
                'role' => 'Administrator',
                'status' => 'Active',
            ],
            [
                'full_name' => 'Joel Navarro',
                'email' => 'encoder@schooloffisheries.local',
                'profile_image' => null,
                'username' => 'encoder',
                'password_hash' => password_hash('encode123', PASSWORD_DEFAULT),
                'role' => 'Encoder',
                'status' => 'Active',
            ],
        ];

        foreach ($users as $user) {
            DB::table('users')->updateOrInsert(
                ['username' => $user['username']],
                $user
            );
        }
    }
}
