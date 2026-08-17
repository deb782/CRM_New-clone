<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // User <-> Project assignment (scoping). Empty assignment = unrestricted.
        Schema::create('project_user', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->timestamps();
            $t->unique(['user_id', 'project_id']);
        });

        // Site expenses with a two-stage approval workflow.
        Schema::create('expenses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->foreignId('phase_id')->nullable()->constrained()->nullOnDelete();
            $t->string('title');
            $t->string('category')->default('material'); // material|labour|equipment|transport|utilities|other
            $t->string('vendor')->nullable();
            $t->bigInteger('amount')->default(0);
            $t->date('incurred_on')->nullable();
            $t->text('description')->nullable();
            // pending_accounts -> pending_management -> approved | rejected
            $t->string('status')->default('pending_accounts');
            $t->foreignId('raised_by')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignId('accounts_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('accounts_approved_at')->nullable();
            $t->foreignId('management_approved_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('management_approved_at')->nullable();
            $t->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('rejected_at')->nullable();
            $t->string('rejection_reason')->nullable();
            $t->string('receipt_path')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('status');
            $t->index('project_id');
        });

        // Per-project material catalog with an opening balance.
        Schema::create('stock_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('unit')->default('nos'); // bag|kg|nos|cum|ton|litre
            $t->decimal('opening_qty', 14, 2)->default(0);
            $t->timestamps();
            $t->unique(['project_id', 'name']);
        });

        // Material ledger movements. Inward links to an approved expense.
        Schema::create('stock_movements', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->foreignId('stock_item_id')->constrained()->cascadeOnDelete();
            $t->string('direction'); // inward|outward
            $t->decimal('qty', 14, 2)->default(0);
            $t->foreignId('expense_id')->nullable()->constrained()->nullOnDelete();
            $t->string('note')->nullable();
            $t->date('moved_on')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->index(['project_id', 'stock_item_id']);
            $t->index('direction');
        });

        // Per-project revenue targets for target-vs-variance roll-up.
        Schema::create('revenue_targets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('project_id')->constrained()->cascadeOnDelete();
            $t->string('period_type')->default('month'); // month|quarter
            $t->string('period'); // 2026-06 | 2026-Q2
            $t->bigInteger('amount')->default(0);
            $t->timestamps();
            $t->unique(['project_id', 'period_type', 'period']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revenue_targets');
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_items');
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('project_user');
    }
};
