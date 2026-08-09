<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_plans', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('code')->nullable();
            $t->text('description')->nullable();
            $t->json('milestones'); // [{label, pct}] pct sums to 100
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        Schema::create('cost_sheets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('plot_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('payment_plan_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $t->bigInteger('base_price')->default(0);
            $t->decimal('gst_rate', 5, 2)->default(5);
            $t->bigInteger('gst_amount')->default(0);
            $t->bigInteger('registration_charges')->default(0);
            $t->bigInteger('maintenance_charges')->default(0);
            $t->bigInteger('other_charges')->default(0);
            $t->string('other_label')->nullable();

            $t->decimal('discount_pct', 5, 2)->default(0);
            $t->bigInteger('discount_amount')->default(0);
            $t->string('discount_reason')->nullable();
            $t->string('discount_band')->default('none'); // none|within_5|over_5|over_10
            $t->string('discount_status')->default('none'); // none|pending|approved|rejected
            $t->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();

            $t->bigInteger('subtotal')->default(0);
            $t->bigInteger('total')->default(0);
            $t->string('status')->default('draft'); // draft|shared
            $t->json('meta')->nullable();
            $t->timestamps();
        });

        Schema::create('discount_approvals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cost_sheet_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $t->decimal('discount_pct', 5, 2);
            $t->bigInteger('discount_amount');
            $t->string('band'); // over_5|over_10
            $t->string('reason')->nullable();
            $t->string('status')->default('pending'); // pending|approved|rejected|counter
            $t->decimal('counter_pct', 5, 2)->nullable();
            $t->string('decision_note')->nullable();
            $t->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
        });

        Schema::create('proposals', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('cost_sheet_id')->nullable()->constrained()->nullOnDelete();
            $t->string('reference_no')->unique();
            $t->json('snapshot')->nullable();          // unit + pricing snapshot
            $t->json('payment_plan_snapshot')->nullable();
            $t->string('status')->default('draft');    // draft|sent|accepted|rejected
            $t->boolean('consent_captured')->default(false);
            $t->string('consent_name')->nullable();
            $t->timestamp('consent_at')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proposals');
        Schema::dropIfExists('discount_approvals');
        Schema::dropIfExists('cost_sheets');
        Schema::dropIfExists('payment_plans');
    }
};
