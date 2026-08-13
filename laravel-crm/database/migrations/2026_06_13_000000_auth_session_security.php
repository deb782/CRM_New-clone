<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $t) {
            if (! Schema::hasColumn('personal_access_tokens', 'ip_address')) {
                $t->string('ip_address', 64)->nullable()->after('abilities');
            }
            if (! Schema::hasColumn('personal_access_tokens', 'user_agent')) {
                $t->string('user_agent', 512)->nullable()->after('ip_address');
            }
        });

        Schema::create('auth_audit_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('email')->nullable();
            $t->string('event'); // login|logout|login_failed|logout_all|session_revoked|password_reset|password_reset_requested|account_disabled
            $t->string('ip_address', 64)->nullable();
            $t->string('user_agent', 512)->nullable();
            $t->json('meta')->nullable();
            $t->timestamp('created_at')->nullable();
            $t->index(['user_id', 'event']);
            $t->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auth_audit_logs');
        Schema::table('personal_access_tokens', function (Blueprint $t) {
            $t->dropColumn(['ip_address', 'user_agent']);
        });
    }
};
