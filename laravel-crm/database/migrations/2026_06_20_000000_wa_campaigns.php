<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_campaigns')) {
            Schema::create('wa_campaigns', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->unsignedBigInteger('template_id')->nullable();
                $t->string('template_name')->nullable();
                $t->json('audience')->nullable();
                $t->json('variables')->nullable();
                $t->timestamp('scheduled_at')->nullable();
                $t->string('status')->default('draft'); // draft|scheduled|sending|sent|cancelled
                $t->boolean('simulated')->default(false);
                $t->json('stats')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
        if (! Schema::hasTable('wa_campaign_recipients')) {
            Schema::create('wa_campaign_recipients', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('campaign_id')->index();
                $t->unsignedBigInteger('lead_id')->nullable();
                $t->string('phone')->nullable();
                $t->string('name')->nullable();
                $t->string('status')->default('queued'); // queued|sent|delivered|read|replied|failed
                $t->string('provider_id')->nullable()->index();
                $t->timestamp('sent_at')->nullable();
                $t->timestamp('delivered_at')->nullable();
                $t->timestamp('read_at')->nullable();
                $t->timestamp('replied_at')->nullable();
                $t->string('error')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('wa_campaign_recipients');
        Schema::dropIfExists('wa_campaigns');
    }
};
