<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bookings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('plot_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('cost_sheet_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('proposal_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $t->string('booking_ref')->unique();
            $t->string('form_token')->unique();
            $t->string('status')->default('initiated'); // initiated|form_sent|form_submitted|verified|confirmed|cancelled
            $t->json('form_data')->nullable();

            $t->bigInteger('deal_value')->default(0);
            $t->bigInteger('token_amount')->default(0);
            $t->string('token_status')->default('pending'); // pending|paid|failed
            $t->string('payment_link')->nullable();
            $t->string('payment_ref')->nullable();
            $t->timestamp('token_paid_at')->nullable();

            $t->timestamp('form_sent_at')->nullable();
            $t->timestamp('form_submitted_at')->nullable();
            $t->timestamp('verified_at')->nullable();
            $t->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('status');
        });

        Schema::table('leads', function (Blueprint $t) {
            $t->boolean('locked')->default(false)->after('do_not_contact');
            $t->timestamp('locked_at')->nullable()->after('locked');
            $t->string('lost_reason')->nullable()->after('locked_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bookings');
        Schema::table('leads', function (Blueprint $t) {
            $t->dropColumn(['locked', 'locked_at', 'lost_reason']);
        });
    }
};
