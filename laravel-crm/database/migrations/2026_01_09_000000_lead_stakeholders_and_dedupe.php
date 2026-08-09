<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $t) {
            $t->json('stakeholders')->nullable();       // R: multiple decision-makers
            $t->json('interested_units')->nullable();   // R: multiple units of interest
            $t->string('dedupe_key')->nullable()->unique(); // R: concurrency de-dup guard
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $t) {
            $t->dropUnique(['dedupe_key']);
            $t->dropColumn(['stakeholders', 'interested_units', 'dedupe_key']);
        });
    }
};
