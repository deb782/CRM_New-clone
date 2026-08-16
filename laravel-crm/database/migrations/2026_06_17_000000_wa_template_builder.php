<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_templates', function (Blueprint $t) {
            if (! Schema::hasColumn('whatsapp_templates', 'header_type')) {
                $t->string('header_type')->default('none')->after('category'); // none|text|image|document|video
            }
            if (! Schema::hasColumn('whatsapp_templates', 'header_text')) {
                $t->string('header_text')->nullable()->after('header_type');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'footer')) {
                $t->string('footer')->nullable()->after('body');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'buttons')) {
                $t->json('buttons')->nullable()->after('footer');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'example')) {
                $t->json('example')->nullable()->after('buttons');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'rejection_reason')) {
                $t->string('rejection_reason')->nullable()->after('status');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'provider_id')) {
                $t->string('provider_id')->nullable()->after('rejection_reason');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'created_by')) {
                $t->unsignedBigInteger('created_by')->nullable()->after('provider_id');
            }
            if (! Schema::hasColumn('whatsapp_templates', 'submitted_at')) {
                $t->timestamp('submitted_at')->nullable()->after('synced_at');
            }
        });
    }

    public function down(): void
    {
        // non-destructive
    }
};
