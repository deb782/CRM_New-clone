<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->string('referral_code')->nullable()->unique()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->dropUnique(['referral_code']);
            $t->dropColumn('referral_code');
        });
    }
};
