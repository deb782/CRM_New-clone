<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            if (! Schema::hasColumn('lead_statuses', 'wa_buttons')) {
                $t->json('wa_buttons')->nullable()->after('wa_enabled'); // [{label, next_code}] up to 3
            }
        });
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            $t->dropColumn('wa_buttons');
        });
    }
};
