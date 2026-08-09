<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Projects -> Phases -> Plots/Units
        Schema::create('phases', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('code')->nullable();
            $t->unsignedInteger('sort_order')->default(0);
            $t->string('status')->default('active');
            $t->string('possession_target')->nullable();
            $t->timestamps();
        });

        Schema::create('plots', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->foreignId('phase_id')->nullable()->constrained()->nullOnDelete();
            $t->string('number');            // unit / plot number
            $t->string('unit_type')->nullable(); // 1BHK / 2BHK / Plot
            $t->decimal('carpet_area', 10, 2)->nullable();
            $t->decimal('built_up_area', 10, 2)->nullable();
            $t->string('floor')->nullable();
            $t->string('facing')->nullable();
            $t->bigInteger('price')->nullable();
            $t->string('status')->default('available'); // available|held|booked|sold
            $t->foreignId('held_by_lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $t->timestamp('hold_expires_at')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('status');
        });

        // Site Visits (Sections I & J)
        Schema::create('site_visits', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('plot_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('scheduled_at');
            $t->unsignedInteger('duration_min')->default(60);
            $t->string('meeting_point')->nullable();
            $t->string('status')->default('scheduled'); // scheduled|confirmed|rescheduled|completed|no_show|cancelled|at_risk
            $t->string('confirmation_status')->default('pending'); // pending|confirmed|rescheduled

            // execution (J)
            $t->timestamp('checkin_at')->nullable();
            $t->timestamp('checkout_at')->nullable();
            $t->string('checkin_geo')->nullable();
            $t->text('properties_viewed')->nullable();
            $t->string('buyer_mood')->nullable();
            $t->unsignedTinyInteger('buyer_interest_score')->nullable(); // 1-10
            $t->text('feedback')->nullable();
            $t->text('concerns')->nullable();
            $t->string('interest_level')->nullable(); // very_high|high|medium|low
            $t->string('outcome')->nullable(); // interested|considering|not_interested|no_show|reschedule
            $t->string('loss_reason')->nullable();

            // reminders / reschedule tracking (I)
            $t->unsignedInteger('reschedule_count')->default(0);
            $t->string('reschedule_reason')->nullable();
            $t->json('reminders_sent')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('status');
            $t->index('scheduled_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_visits');
        Schema::dropIfExists('plots');
        Schema::dropIfExists('phases');
    }
};
