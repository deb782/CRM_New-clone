<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Website Form Builder + Website Chatbot (ported feature).
 * Self-contained: no dependency on campaigns/lead_sources tables.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('forms')) {
            Schema::create('forms', function (Blueprint $t) {
                $t->id();
                $t->uuid('uuid')->unique();
                $t->string('slug', 100)->unique();
                $t->string('name', 200);
                $t->unsignedBigInteger('project_id')->nullable()->index();
                $t->string('redirect_url', 500)->nullable();
                $t->json('settings')->nullable();
                $t->boolean('is_active')->default(true);
                $t->unsignedInteger('submission_count')->default(0);
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
            });
        }

        if (! Schema::hasTable('form_fields')) {
            Schema::create('form_fields', function (Blueprint $t) {
                $t->id();
                $t->foreignId('form_id')->constrained('forms')->cascadeOnDelete();
                $t->string('slug', 100);
                $t->string('label', 200);
                $t->string('type', 40)->default('text');
                $t->json('options')->nullable();
                $t->string('placeholder', 200)->nullable();
                $t->boolean('is_required')->default(false);
                $t->string('maps_to_field', 60)->nullable();
                $t->integer('sort_order')->default(0);
                $t->timestamps();
            });
        }

        if (! Schema::hasTable('chatbots')) {
            Schema::create('chatbots', function (Blueprint $t) {
                $t->id();
                $t->uuid('uuid')->unique();
                $t->string('name');
                $t->string('slug')->unique();
                $t->unsignedBigInteger('project_id')->nullable()->index();
                $t->string('brand_name', 80)->default('Support');
                $t->string('brand_color', 20)->default('#0f3d33');
                $t->text('welcome_message')->nullable();
                $t->string('start_node_key', 60)->default('start');
                $t->boolean('is_active')->default(true);
                $t->boolean('escalate_on_qualified')->default(true);
                $t->json('settings')->nullable();
                $t->unsignedBigInteger('created_by')->nullable();
                $t->timestamps();
                $t->softDeletes();
            });
        }

        if (! Schema::hasTable('chatbot_nodes')) {
            Schema::create('chatbot_nodes', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('chatbot_id')->index();
                $t->string('key', 60);
                $t->enum('type', ['message', 'quick_reply', 'collect', 'end']);
                $t->text('content');
                $t->string('collect_field', 60)->nullable();
                $t->string('collect_validator', 30)->nullable();
                $t->json('options')->nullable();
                $t->string('next_key', 60)->nullable();
                $t->boolean('marks_qualified')->default(false);
                $t->integer('sort_order')->default(0);
                $t->timestamps();
                $t->unique(['chatbot_id', 'key']);
            });
        }

        if (! Schema::hasTable('chatbot_sessions')) {
            Schema::create('chatbot_sessions', function (Blueprint $t) {
                $t->id();
                $t->uuid('uuid')->unique();
                $t->unsignedBigInteger('chatbot_id')->index();
                $t->string('current_node_key', 60)->nullable();
                $t->json('visitor_data')->nullable();
                $t->json('transcript')->nullable();
                $t->boolean('is_qualified')->default(false);
                $t->unsignedBigInteger('lead_id')->nullable()->index();
                $t->string('ip', 45)->nullable();
                $t->string('user_agent', 255)->nullable();
                $t->timestamp('completed_at')->nullable();
                $t->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('chatbot_sessions');
        Schema::dropIfExists('chatbot_nodes');
        Schema::dropIfExists('chatbots');
        Schema::dropIfExists('form_fields');
        Schema::dropIfExists('forms');
    }
};
