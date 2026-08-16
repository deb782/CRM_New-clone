<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_flows')) {
            Schema::create('wa_flows', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->string('description')->nullable();
                $t->string('trigger_type')->default('keyword'); // keyword | default
                $t->json('keywords')->nullable();
                $t->string('status')->default('draft'); // draft | active
                $t->json('graph')->nullable(); // { entry, nodes: {key:{...}} }
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('wa_flows');
    }
};
