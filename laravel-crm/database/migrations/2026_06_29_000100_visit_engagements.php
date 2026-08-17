<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('visit_engagements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('site_visit_id')->nullable();
            $t->string('mode', 24)->default('site_visit'); // site_visit | google_meet
            $t->dateTime('appointment_at');
            $t->string('baseline_status_code', 40)->nullable(); // loop stops if lead status changes from this
            $t->dateTime('next_send_at')->nullable();
            $t->unsignedInteger('sends_done')->default(0);
            $t->unsignedInteger('total_sends')->default(0);
            $t->boolean('active')->default(true);
            $t->string('stopped_reason', 40)->nullable(); // completed | appointment_reached | status_changed
            $t->timestamps();
            $t->index(['active', 'next_send_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visit_engagements');
    }
};
