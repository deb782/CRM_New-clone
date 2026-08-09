<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_conversations', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('contact_phone')->unique();
            $t->string('contact_name')->nullable();
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->string('status')->default('open'); // open|closed
            $t->unsignedInteger('unread_count')->default(0);
            $t->text('last_message_preview')->nullable();
            $t->timestamp('last_message_at')->nullable();
            $t->timestamp('last_inbound_at')->nullable(); // drives 24h session window
            $t->timestamps();
            $t->index(['status', 'assigned_to']);
        });

        Schema::table('whatsapp_messages', function (Blueprint $t) {
            $t->foreignId('conversation_id')->nullable()->after('id')->constrained('whatsapp_conversations')->nullOnDelete();
            $t->string('message_type')->default('text')->after('direction'); // text|template|image|document|video|location|interactive
            $t->text('media_url')->nullable()->after('body');
            $t->string('sender_name')->nullable()->after('media_url');
        });

        Schema::create('whatsapp_broadcasts', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->text('body')->nullable();
            $t->string('template')->nullable();
            $t->string('audience_type')->default('all'); // all|tag|status|temperature|source
            $t->string('audience_value')->nullable();
            $t->string('status')->default('draft'); // draft|sending|sent
            $t->unsignedInteger('recipients')->default(0);
            $t->unsignedInteger('sent_count')->default(0);
            $t->unsignedInteger('failed_count')->default(0);
            $t->timestamp('sent_at')->nullable();
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('whatsapp_auto_replies', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('keyword');
            $t->string('match_type')->default('contains'); // contains|exact|starts
            $t->text('reply_body')->nullable();
            $t->string('reply_template')->nullable();
            $t->boolean('active')->default(true);
            $t->unsignedInteger('hits')->default(0);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $t) {
            $t->dropConstrainedForeignId('conversation_id');
            $t->dropColumn(['message_type', 'media_url', 'sender_name']);
        });
        Schema::dropIfExists('whatsapp_auto_replies');
        Schema::dropIfExists('whatsapp_broadcasts');
        Schema::dropIfExists('whatsapp_conversations');
    }
};
