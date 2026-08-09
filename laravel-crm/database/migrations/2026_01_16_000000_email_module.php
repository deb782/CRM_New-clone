<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_templates', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('subject')->nullable();
            $t->string('category')->default('General');
            $t->longText('html')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('email_campaigns', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('subject');
            $t->foreignId('template_id')->nullable()->constrained('email_templates')->nullOnDelete();
            $t->longText('html')->nullable();
            $t->string('audience_type')->default('all'); // all|status|temperature|source
            $t->string('audience_value')->nullable();
            $t->string('from_name')->nullable();
            $t->string('from_email')->nullable();
            $t->string('status')->default('draft'); // draft|sending|sent
            $t->unsignedInteger('recipients')->default(0);
            $t->unsignedInteger('sent_count')->default(0);
            $t->unsignedInteger('failed_count')->default(0);
            $t->unsignedInteger('open_count')->default(0);
            $t->unsignedInteger('click_count')->default(0);
            $t->timestamp('sent_at')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('email_messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('campaign_id')->constrained('email_campaigns')->cascadeOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $t->string('to_email');
            $t->string('subject')->nullable();
            $t->string('status')->default('queued'); // queued|sent|failed
            $t->string('open_token', 64)->unique();
            $t->string('provider_id')->nullable();
            $t->timestamp('opened_at')->nullable();
            $t->timestamp('clicked_at')->nullable();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_messages');
        Schema::dropIfExists('email_campaigns');
        Schema::dropIfExists('email_templates');
    }
};
