<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $t) {
            $t->json('meta')->nullable()->after('sender_name'); // buttons, interactive payload, etc.
        });

        Schema::create('whatsapp_templates', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('language')->default('en_US');
            $t->string('category')->default('UTILITY');
            $t->text('body')->nullable();
            $t->string('status')->default('APPROVED');
            $t->timestamp('synced_at')->nullable();
            $t->timestamps();
            $t->unique(['name', 'language']);
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $t) {
            $t->dropColumn('meta');
        });
        Schema::dropIfExists('whatsapp_templates');
    }
};
