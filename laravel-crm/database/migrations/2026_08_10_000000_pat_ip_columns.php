<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Adds session IP/device columns to personal_access_tokens AFTER the table is created
// (the create-table migration is dated later than the original auth-security migration).
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('personal_access_tokens')) {
            return;
        }
        Schema::table('personal_access_tokens', function (Blueprint $t) {
            if (! Schema::hasColumn('personal_access_tokens', 'ip_address')) {
                $t->string('ip_address', 64)->nullable()->after('abilities');
            }
            if (! Schema::hasColumn('personal_access_tokens', 'user_agent')) {
                $t->string('user_agent', 512)->nullable()->after('ip_address');
            }
        });
    }

    public function down(): void
    {
        // no-op; columns handled by the base auth-security migration
    }
};
