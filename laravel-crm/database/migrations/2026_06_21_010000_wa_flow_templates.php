<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('wa_flow_templates')) {
            Schema::create('wa_flow_templates', function (Blueprint $t) {
                $t->id();
                $t->string('name');
                $t->string('description')->nullable();
                $t->json('graph')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('wa_flow_templates');
    }
};
