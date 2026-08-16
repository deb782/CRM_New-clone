<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_conversations', function (Blueprint $t) {
            if (! Schema::hasColumn('whatsapp_conversations', 'bot_state')) {
                $t->json('bot_state')->nullable()->after('tags');
            }
        });
    }

    public function down(): void {}
};
