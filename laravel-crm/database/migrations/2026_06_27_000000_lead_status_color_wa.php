<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            if (! Schema::hasColumn('lead_statuses', 'color')) {
                $t->string('color', 12)->nullable()->after('display_name');
            }
            if (! Schema::hasColumn('lead_statuses', 'wa_message')) {
                $t->text('wa_message')->nullable()->after('color'); // customer WhatsApp on entering this status
            }
            if (! Schema::hasColumn('lead_statuses', 'wa_enabled')) {
                $t->boolean('wa_enabled')->default(false)->after('wa_message');
            }
        });
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            $t->dropColumn(['color', 'wa_message', 'wa_enabled']);
        });
    }
};
