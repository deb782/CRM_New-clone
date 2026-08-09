<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $t) {
            $t->json('tags')->nullable()->after('status');
        });

        Schema::create('whatsapp_notes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('conversation_id')->constrained('whatsapp_conversations')->cascadeOnDelete();
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->text('body');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_notes');
        Schema::table('whatsapp_conversations', function (Blueprint $t) {
            $t->dropColumn('tags');
        });
    }
};
