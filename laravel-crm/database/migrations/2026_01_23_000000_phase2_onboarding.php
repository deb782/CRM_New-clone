<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('must_change_password')->default(false)->after('is_active');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->string('project_type', 30)->nullable()->after('code'); // plotted | residential
            $table->json('meta')->nullable()->after('description');
        });

        Schema::table('plots', function (Blueprint $table) {
            $table->string('category', 60)->nullable()->after('phase_id');
            $table->json('attributes')->nullable()->after('meta');
        });

        Schema::create('onboarding_states', function (Blueprint $table) {
            $table->id();
            $table->string('setup_choice', 20)->nullable(); // now | later
            $table->json('steps')->nullable();               // { profile: true, ... }
            $table->boolean('completed')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('onboarding_states');
        Schema::table('plots', fn (Blueprint $t) => $t->dropColumn(['category', 'attributes']));
        Schema::table('projects', fn (Blueprint $t) => $t->dropColumn(['project_type', 'meta']));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('must_change_password'));
    }
};
