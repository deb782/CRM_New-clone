<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_canned_replies', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->string('shortcut')->nullable(); // e.g. /hours
            $t->text('body');
            $t->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('whatsapp_settings', function (Blueprint $t) {
            $t->id();
            $t->boolean('auto_assign')->default(true);
            $t->timestamps();
        });
        DB::table('whatsapp_settings')->insert(['auto_assign' => true, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_canned_replies');
        Schema::dropIfExists('whatsapp_settings');
    }
};
