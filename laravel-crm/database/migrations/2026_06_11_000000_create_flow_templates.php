<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('flow_templates')) {
            Schema::create('flow_templates', function (Blueprint $t) {
                $t->id();
                $t->string('name', 160);
                $t->string('description', 400)->nullable();
                $t->json('graph');
                $t->unsignedInteger('node_count')->default(0);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->string('created_by_name', 120)->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('flow_templates');
    }
};
