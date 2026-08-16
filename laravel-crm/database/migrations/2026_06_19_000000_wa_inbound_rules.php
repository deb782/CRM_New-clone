<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_inbound_rules')) {
            Schema::create('wa_inbound_rules', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->json('keywords')->nullable();
                $t->string('match_type')->default('contains'); // contains | exact
                $t->string('action')->default('assign'); // bot | assign | tag | reply
                $t->unsignedBigInteger('flow_id')->nullable();
                $t->unsignedBigInteger('assignee_id')->nullable();
                $t->string('tag')->nullable();
                $t->text('reply_text')->nullable();
                $t->unsignedInteger('priority')->default(100);
                $t->boolean('enabled')->default(true);
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('wa_inbound_rules');
    }
};
