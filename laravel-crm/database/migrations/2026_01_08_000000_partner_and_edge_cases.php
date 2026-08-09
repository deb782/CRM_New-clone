<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete();
        });
        Schema::table('leads', function (Blueprint $t) {
            $t->foreignId('channel_partner_id')->nullable()->after('owner_id')->constrained('channel_partners')->nullOnDelete();
        });
        Schema::table('bookings', function (Blueprint $t) {
            $t->foreignId('channel_partner_id')->nullable()->after('created_by')->constrained('channel_partners')->nullOnDelete();
            $t->decimal('commission_pct', 6, 2)->default(0)->after('channel_partner_id');
            $t->bigInteger('commission_amount')->default(0)->after('commission_pct');
            $t->string('commission_status')->default('none')->after('commission_amount'); // none|pending|approved|paid
            $t->timestamp('cancelled_at')->nullable();
            $t->string('cancellation_reason')->nullable();
        });
        Schema::table('payments', function (Blueprint $t) {
            $t->string('failure_reason')->nullable()->after('reconcile_note');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $t) {
            $t->dropColumn('failure_reason');
        });
        Schema::table('bookings', function (Blueprint $t) {
            $t->dropConstrainedForeignId('channel_partner_id');
            $t->dropColumn(['commission_pct', 'commission_amount', 'commission_status', 'cancelled_at', 'cancellation_reason']);
        });
        Schema::table('leads', function (Blueprint $t) {
            $t->dropConstrainedForeignId('channel_partner_id');
        });
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->dropConstrainedForeignId('user_id');
        });
    }
};
