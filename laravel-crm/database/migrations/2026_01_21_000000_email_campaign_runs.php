<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_campaign_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('campaign_id')->index();
            $table->unsignedInteger('run_number')->default(1);
            $table->unsignedInteger('recipients')->default(0);
            $table->unsignedInteger('sent_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        Schema::table('email_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('run_id')->nullable()->index()->after('campaign_id');
        });
    }

    public function down(): void
    {
        Schema::table('email_messages', function (Blueprint $table) {
            $table->dropColumn('run_id');
        });
        Schema::dropIfExists('email_campaign_runs');
    }
};
