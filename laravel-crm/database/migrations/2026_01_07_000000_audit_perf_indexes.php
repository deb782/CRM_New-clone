<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $t) {
            $t->index(['owner_id', 'status'], 'leads_owner_status_idx');
            $t->index('source', 'leads_source_idx');
            $t->index('created_at', 'leads_created_idx');
        });
        Schema::table('audit_logs', function (Blueprint $t) {
            $t->index('created_at', 'audit_created_idx');
            $t->index('action', 'audit_action_idx');
            $t->index('user_id', 'audit_user_idx');
        });
        Schema::table('automation_logs', function (Blueprint $t) {
            $t->index(['status', 'created_at'], 'automation_status_created_idx');
        });
        Schema::table('communication_logs', function (Blueprint $t) {
            $t->index(['status', 'channel'], 'comm_status_channel_idx');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $t) {
            $t->dropIndex('leads_owner_status_idx');
            $t->dropIndex('leads_source_idx');
            $t->dropIndex('leads_created_idx');
        });
        Schema::table('audit_logs', function (Blueprint $t) {
            $t->dropIndex('audit_created_idx');
            $t->dropIndex('audit_action_idx');
            $t->dropIndex('audit_user_idx');
        });
        Schema::table('automation_logs', function (Blueprint $t) {
            $t->dropIndex('automation_status_created_idx');
        });
        Schema::table('communication_logs', function (Blueprint $t) {
            $t->dropIndex('comm_status_channel_idx');
        });
    }
};
