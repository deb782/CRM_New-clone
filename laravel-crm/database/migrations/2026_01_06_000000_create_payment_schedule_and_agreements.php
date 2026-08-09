<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // P — Milestone payment schedule
        Schema::create('payment_milestones', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_sheet_id')->nullable()->constrained()->nullOnDelete();
            $t->integer('seq')->default(0);
            $t->string('label');
            $t->decimal('pct', 6, 2)->default(0);
            $t->bigInteger('amount')->default(0);
            $t->bigInteger('paid_amount')->default(0);
            $t->timestamp('due_at')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->string('status')->default('pending'); // pending|due|partial|paid|overdue
            $t->json('reminders_sent')->nullable();
            $t->unsignedBigInteger('demand_letter_id')->nullable();
            $t->timestamps();
            $t->index(['booking_id', 'seq']);
            $t->index('status');
        });

        // O — Agreement for Sale (RERA-style) + mock e-sign + registration
        Schema::create('agreements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type')->default('afs');
            $t->string('serial_no')->unique();
            $t->longText('body');
            $t->string('status')->default('draft'); // draft|sent_for_sign|signed|registered
            $t->string('esign_provider')->nullable();
            $t->string('esign_ref')->nullable();
            $t->timestamp('sent_for_sign_at')->nullable();
            $t->timestamp('review_until')->nullable(); // 5-day legal review window
            $t->timestamp('signed_at')->nullable();
            $t->string('signed_file_path')->nullable();
            $t->string('registration_no')->nullable();
            $t->timestamp('registered_at')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->json('meta')->nullable();
            $t->timestamps();
        });

        // Q — Demand letters with late interest + delivery log + escalation
        Schema::create('demand_letters', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('payment_milestone_id')->nullable()->constrained()->nullOnDelete();
            $t->string('serial_no')->unique();
            $t->bigInteger('amount_due')->default(0);
            $t->integer('days_overdue')->default(0);
            $t->decimal('interest_rate', 6, 2)->default(0); // annual %
            $t->bigInteger('late_interest')->default(0);
            $t->bigInteger('total_due')->default(0);
            $t->string('status')->default('issued'); // issued|paid|escalated
            $t->string('delivered_via')->nullable();
            $t->timestamp('delivered_at')->nullable();
            $t->string('registered_post_ref')->nullable();
            $t->timestamp('escalated_at')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('demand_letters');
        Schema::dropIfExists('agreements');
        Schema::dropIfExists('payment_milestones');
    }
};
