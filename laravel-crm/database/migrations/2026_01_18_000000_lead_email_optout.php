<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->boolean('email_opt_out')->default(false)->after('do_not_contact');
            $table->timestamp('email_opt_out_at')->nullable()->after('email_opt_out');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn(['email_opt_out', 'email_opt_out_at']);
        });
    }
};
