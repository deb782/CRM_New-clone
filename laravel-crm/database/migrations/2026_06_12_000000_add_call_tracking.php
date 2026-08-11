<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calls', function (Blueprint $t) {
            if (! Schema::hasColumn('calls', 'provider_call_id')) {
                $t->string('provider_call_id', 120)->nullable()->index()->after('user_id');
            }
            if (! Schema::hasColumn('calls', 'status')) {
                $t->string('status', 40)->nullable()->after('provider_call_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('calls', function (Blueprint $t) {
            if (Schema::hasColumn('calls', 'provider_call_id')) $t->dropColumn('provider_call_id');
            if (Schema::hasColumn('calls', 'status')) $t->dropColumn('status');
        });
    }
};
