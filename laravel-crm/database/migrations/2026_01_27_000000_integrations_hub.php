<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('integrations')) {
            Schema::create('integrations', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->boolean('enabled')->default(false);
                $table->text('config')->nullable(); // encrypted JSON
                $table->string('status')->nullable(); // connected|error
                $table->text('last_error')->nullable();
                $table->timestamp('last_tested_at')->nullable();
                $table->timestamps();
            });
        }

        // integrations.manage permission for Admin + Process Admin
        $permId = DB::table('permissions')->where('key', 'integrations.manage')->value('id');
        if (! $permId) {
            $permId = DB::table('permissions')->insertGetId([
                'key' => 'integrations.manage',
                'label' => 'Manage integrations',
                'group' => 'config',
            ]);
        }
        $paId = DB::table('roles')->where('slug', 'process_admin')->value('id');
        if ($paId && ! DB::table('permission_role')->where(['permission_id' => $permId, 'role_id' => $paId])->exists()) {
            DB::table('permission_role')->insert(['permission_id' => $permId, 'role_id' => $paId]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('integrations');
        $permId = DB::table('permissions')->where('key', 'integrations.manage')->value('id');
        if ($permId) {
            DB::table('permission_role')->where('permission_id', $permId)->delete();
            DB::table('permissions')->where('id', $permId)->delete();
        }
    }
};
