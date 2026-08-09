<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->string('widget_title')->nullable()->after('referral_code');
            $t->string('widget_accent', 9)->nullable()->after('widget_title');
            $t->text('widget_greeting')->nullable()->after('widget_accent');
        });
    }

    public function down(): void
    {
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->dropColumn(['widget_title', 'widget_accent', 'widget_greeting']);
        });
    }
};
