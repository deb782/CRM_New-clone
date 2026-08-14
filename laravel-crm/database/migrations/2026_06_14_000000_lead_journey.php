<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_statuses', function (Blueprint $t) {
            $t->id();
            $t->string('stage_key', 8);          // S1..S5
            $t->string('stage_name');            // lane title
            $t->string('code')->unique();        // S1_NEW, S2_QUALIFYING ...
            $t->string('display_name');
            $t->integer('sort')->default(0);
            $t->boolean('is_terminal')->default(false);
            $t->string('disposition')->nullable();   // lost | nurture | null
            $t->json('allowed_next')->nullable();    // ["S1_ASSIGNED", ...]
            $t->json('gate_fields')->nullable();     // lead fields that must be filled before entering
            $t->integer('sla_minutes')->nullable();  // SLA clock for this status
            $t->string('pipeline_slug')->nullable(); // maps to existing PipelineStage board
            $t->integer('lane_sla_minutes')->nullable();
            $t->timestamps();
            $t->index('stage_key');
        });

        Schema::table('leads', function (Blueprint $t) {
            if (! Schema::hasColumn('leads', 'status_code')) {
                $t->string('status_code')->nullable()->after('status');
            }
            if (! Schema::hasColumn('leads', 'status_sla_due_at')) {
                $t->timestamp('status_sla_due_at')->nullable()->after('status_code');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_statuses');
        Schema::table('leads', function (Blueprint $t) {
            $t->dropColumn(['status_code', 'status_sla_due_at']);
        });
    }
};
