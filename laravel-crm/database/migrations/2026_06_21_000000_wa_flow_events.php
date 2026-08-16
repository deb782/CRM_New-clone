<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_flow_events')) {
            Schema::create('wa_flow_events', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('flow_id')->index();
                $t->unsignedBigInteger('conversation_id')->nullable();
                $t->string('node_key')->nullable();
                $t->string('event'); // enter | reach | choose | handoff | complete
                $t->string('option_id')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('wa_flow_events');
    }
};
