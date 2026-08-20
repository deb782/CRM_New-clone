<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            if (! Schema::hasColumn('lead_statuses', 'wa_template')) {
                $t->string('wa_template')->nullable()->after('wa_buttons'); // Meta approved template name
            }
            if (! Schema::hasColumn('lead_statuses', 'email_enabled')) {
                $t->boolean('email_enabled')->default(false)->after('wa_template');
            }
            if (! Schema::hasColumn('lead_statuses', 'email_subject')) {
                $t->string('email_subject')->nullable()->after('email_enabled');
            }
            if (! Schema::hasColumn('lead_statuses', 'email_body')) {
                $t->text('email_body')->nullable()->after('email_subject');
            }
            if (! Schema::hasColumn('lead_statuses', 'owner_role')) {
                $t->string('owner_role', 32)->nullable()->after('email_body'); // reassign owner to this role slug on entering
            }
        });
    }

    public function down(): void
    {
        Schema::table('lead_statuses', function (Blueprint $t) {
            $t->dropColumn(['wa_template', 'email_enabled', 'email_subject', 'email_body', 'owner_role']);
        });
    }
};
