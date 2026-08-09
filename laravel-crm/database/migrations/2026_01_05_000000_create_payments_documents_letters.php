<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // N — Payments, receipts & accounts reconciliation
        Schema::create('payments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type')->default('token');   // token|eoi|milestone|registration|other
            $t->bigInteger('amount')->default(0);
            $t->string('method')->default('online'); // online|razorpay|cheque|neft|upi|cash
            $t->string('reference')->nullable();     // bank / txn / cheque ref
            $t->string('gateway')->nullable();       // razorpay|mock|manual
            $t->string('gateway_ref')->nullable();   // razorpay payment id
            $t->string('status')->default('received'); // received|verified|reconciled|discrepancy|failed
            $t->string('receipt_no')->nullable()->unique();
            $t->timestamp('receipt_issued_at')->nullable();
            $t->timestamp('received_at')->nullable();
            $t->timestamp('verified_at')->nullable();
            $t->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('reconciled_at')->nullable();
            $t->foreignId('reconciled_by')->nullable()->constrained('users')->nullOnDelete();
            $t->string('reconcile_note')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index(['status', 'type']);
        });

        // N — Initial document checklist
        Schema::create('document_checklist_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name');
            $t->string('category')->default('kyc'); // kyc|financial|legal
            $t->boolean('required')->default(true);
            $t->string('status')->default('pending'); // pending|received|verified|rejected
            $t->string('file_path')->nullable();
            $t->string('notes')->nullable();
            $t->timestamp('due_at')->nullable();
            $t->timestamp('received_at')->nullable();
            $t->timestamp('verified_at')->nullable();
            $t->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $t->boolean('reminded')->default(false);
            $t->timestamps();
            $t->index('status');
        });

        // N/O/Q — Generated letters (welcome now; allotment & demand reuse this)
        Schema::create('letters', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type')->default('welcome'); // welcome|allotment|demand
            $t->string('serial_no')->unique();
            $t->string('title');
            $t->longText('body');
            $t->string('status')->default('generated'); // generated|sent
            $t->timestamp('sent_at')->nullable();
            $t->string('sent_via')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('letters');
        Schema::dropIfExists('document_checklist_items');
        Schema::dropIfExists('payments');
    }
};
