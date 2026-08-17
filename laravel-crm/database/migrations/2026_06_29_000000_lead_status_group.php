<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            if (! Schema::hasColumn('lead_statuses', 'status_group')) {
                $t->string('status_group', 16)->default('bde')->after('stage_name'); // bde | bdm
            }
        });
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            $t->dropColumn('status_group');
        });
    }
};
