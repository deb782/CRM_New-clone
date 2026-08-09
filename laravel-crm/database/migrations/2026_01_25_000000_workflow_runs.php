<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workflow_runs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('workflow_id')->index();
            $table->unsignedBigInteger('lead_id')->index();
            $table->string('status', 20)->default('running'); // running | waiting | completed | failed
            $table->string('current_node', 40)->nullable();
            $table->timestamp('resume_at')->nullable()->index();
            $table->json('log')->nullable();
            $table->boolean('simulated')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workflow_runs');
    }
};
