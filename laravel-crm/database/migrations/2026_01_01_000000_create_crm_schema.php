<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // --- Auth / RBAC ---
        Schema::create('roles', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('slug')->unique();
            $t->string('description')->nullable();
            $t->timestamps();
        });

        Schema::create('permissions', function (Blueprint $t) {
            $t->id();
            $t->string('key')->unique();       // e.g. leads.view
            $t->string('label');
            $t->string('group')->nullable();
            $t->timestamps();
        });

        Schema::create('permission_role', function (Blueprint $t) {
            $t->foreignId('permission_id')->constrained()->cascadeOnDelete();
            $t->foreignId('role_id')->constrained()->cascadeOnDelete();
            $t->primary(['permission_id', 'role_id']);
        });

        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->unique();
            $t->timestamp('email_verified_at')->nullable();
            $t->string('password');
            $t->foreignId('role_id')->nullable()->constrained()->nullOnDelete();
            $t->string('phone')->nullable();
            $t->boolean('is_active')->default(true);
            $t->rememberToken();
            $t->timestamps();
        });

        Schema::create('password_reset_tokens', function (Blueprint $t) {
            $t->string('email')->primary();
            $t->string('token');
            $t->timestamp('created_at')->nullable();
        });

        // --- Inventory (foundation for Sales) ---
        Schema::create('projects', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('code')->unique();
            $t->string('city')->nullable();
            $t->string('zone')->nullable();
            $t->string('address')->nullable();
            $t->json('unit_types')->nullable();     // ["1BHK","2BHK","Plot"]
            $t->bigInteger('price_min')->nullable();
            $t->bigInteger('price_max')->nullable();
            $t->string('status')->default('active');
            $t->text('description')->nullable();
            $t->timestamps();
        });

        // --- Contacts (qualified people) ---
        Schema::create('contacts', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->nullable();
            $t->string('phone')->nullable();
            $t->string('alt_phone')->nullable();
            $t->string('alt_email')->nullable();
            $t->string('city')->nullable();
            $t->string('comm_preference')->default('any'); // any|call|whatsapp|email
            $t->boolean('whatsapp_opt_out')->default(false);
            $t->boolean('do_not_contact')->default(false);
            $t->timestamps();
        });

        // --- Pipeline ---
        Schema::create('pipeline_stages', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('slug')->unique();
            $t->unsignedInteger('sort_order')->default(0);
            $t->string('type')->default('positive'); // positive|negative|special
            $t->boolean('is_won')->default(false);
            $t->boolean('is_lost')->default(false);
            $t->timestamps();
        });

        // --- Leads ---
        Schema::create('leads', function (Blueprint $t) {
            $t->id();
            $t->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->string('name');
            $t->string('email')->nullable();
            $t->string('phone')->nullable();
            $t->string('alt_phone')->nullable();
            $t->string('alt_email')->nullable();
            $t->string('source')->default('Website Form');
            $t->string('campaign')->nullable();
            $t->string('ad_set')->nullable();
            $t->string('city')->nullable();
            $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('pipeline_stage_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status')->default('new_lead');
            $t->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();

            // scoring / temperature
            $t->integer('score')->default(0);
            $t->string('temperature')->default('cold'); // hot|warm|cold
            $t->integer('engagement_score')->default(0);
            $t->integer('qualification_score')->default(0);
            $t->integer('responsiveness_score')->default(0);

            // qualification (D)
            $t->string('interest_level')->nullable(); // very_high|high|medium|low
            $t->bigInteger('budget_min')->nullable();
            $t->bigInteger('budget_max')->nullable();
            $t->string('preferred_location')->nullable();
            $t->string('property_type')->nullable();
            $t->string('timeline')->nullable(); // immediate|1-3m|3-6m|6-12m|later
            $t->string('financing')->nullable(); // cash|loan|mixed
            $t->string('decision_maker')->nullable(); // self|spouse|family|advisor
            $t->text('primary_objection')->nullable();
            $t->string('objection_severity')->nullable(); // blocking|manageable|minor
            $t->text('intent_notes')->nullable();

            // verification (C)
            $t->boolean('contact_verified')->default(false);
            $t->timestamp('verified_at')->nullable();
            $t->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();

            // consent / quality (R8, R1)
            $t->string('comm_preference')->default('any');
            $t->boolean('whatsapp_opt_out')->default(false);
            $t->boolean('do_not_contact')->default(false);
            $t->boolean('is_invalid')->default(false);
            $t->string('invalid_reason')->nullable();

            $t->timestamp('last_contacted_at')->nullable();
            $t->timestamp('next_follow_up_at')->nullable();
            $t->timestamp('acknowledged_at')->nullable();
            $t->integer('contact_attempts')->default(0);
            $t->json('meta')->nullable();
            $t->timestamps();

            $t->index('email');
            $t->index('phone');
            $t->index('status');
            $t->index('temperature');
            $t->index('score');
        });

        // --- Activities (timeline, polymorphic) ---
        Schema::create('activities', function (Blueprint $t) {
            $t->id();
            $t->string('subject_type');
            $t->unsignedBigInteger('subject_id');
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type');   // note|call|whatsapp|email|status_change|task|system
            $t->string('title');
            $t->text('body')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index(['subject_type', 'subject_id']);
        });

        // --- Tasks ---
        Schema::create('tasks', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $t->string('title');
            $t->string('type')->default('follow_up'); // verify|follow_up|callback|escalation
            $t->text('description')->nullable();
            $t->timestamp('due_at')->nullable();
            $t->string('status')->default('open'); // open|done|cancelled
            $t->string('priority')->default('normal'); // low|normal|high
            $t->boolean('escalated')->default(false);
            $t->timestamp('completed_at')->nullable();
            $t->json('meta')->nullable();
            $t->timestamps();
            $t->index('status');
            $t->index('due_at');
        });

        // --- Comms logs ---
        Schema::create('calls', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('direction')->default('outbound');
            $t->string('outcome')->nullable(); // connected|no_answer|switched_off|wrong_number|busy
            $t->integer('duration')->default(0);
            $t->text('notes')->nullable();
            $t->string('recording_url')->nullable();
            $t->timestamp('called_at')->nullable();
            $t->timestamps();
        });

        Schema::create('whatsapp_messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->string('contact_phone')->nullable();
            $t->string('direction')->default('outbound');
            $t->string('template')->nullable();
            $t->text('body')->nullable();
            $t->string('status')->default('queued'); // queued|sent|delivered|read|failed
            $t->string('provider_id')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamp('delivered_at')->nullable();
            $t->timestamp('read_at')->nullable();
            $t->timestamps();
        });

        Schema::create('emails', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->string('to_email')->nullable();
            $t->string('subject')->nullable();
            $t->text('body')->nullable();
            $t->string('status')->default('queued'); // queued|sent|opened|clicked|bounced|failed
            $t->string('message_id')->nullable();
            $t->timestamp('sent_at')->nullable();
            $t->timestamp('opened_at')->nullable();
            $t->timestamp('clicked_at')->nullable();
            $t->timestamp('bounced_at')->nullable();
            $t->timestamps();
        });

        // --- Templates ---
        Schema::create('templates', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('slug')->unique();
            $t->string('channel'); // email|sms|whatsapp
            $t->string('subject')->nullable();
            $t->text('body');
            $t->json('variables')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        // --- Sequences (nurturing E) ---
        Schema::create('sequences', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('temperature')->nullable(); // hot|warm|cold
            $t->text('description')->nullable();
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        Schema::create('sequence_steps', function (Blueprint $t) {
            $t->id();
            $t->foreignId('sequence_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('step_no');
            $t->integer('offset_hours')->default(0); // relative to previous / enrollment
            $t->string('channel'); // email|sms|whatsapp
            $t->foreignId('template_id')->nullable()->constrained()->nullOnDelete();
            $t->string('subject')->nullable();
            $t->text('body')->nullable();
            $t->timestamps();
        });

        Schema::create('sequence_enrollments', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $t->foreignId('sequence_id')->constrained()->cascadeOnDelete();
            $t->unsignedInteger('current_step')->default(0);
            $t->string('status')->default('active'); // active|paused|completed
            $t->string('paused_reason')->nullable();
            $t->timestamp('enrolled_at')->nullable();
            $t->timestamp('next_run_at')->nullable();
            $t->timestamps();
        });

        // --- Scoring rules (H, admin configurable) ---
        Schema::create('scoring_rules', function (Blueprint $t) {
            $t->id();
            $t->string('category'); // engagement|qualification|responsiveness|recency|source
            $t->string('factor');   // human label
            $t->string('field')->nullable();
            $t->string('operator')->nullable(); // =,>,<,in,exists
            $t->string('value')->nullable();
            $t->integer('points')->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        // --- Automation ---
        Schema::create('automation_rules', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('event'); // lead.created|status.changed|email.opened...
            $t->json('conditions')->nullable();
            $t->json('actions');
            $t->integer('delay_minutes')->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });

        Schema::create('automation_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('rule_id')->nullable()->constrained('automation_rules')->nullOnDelete();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('event');
            $t->string('action')->nullable();
            $t->string('status')->default('success'); // success|failed
            $t->text('message')->nullable();
            $t->timestamp('executed_at')->nullable();
            $t->timestamps();
        });

        // --- Audit (T) ---
        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->string('auditable_type');
            $t->unsignedBigInteger('auditable_id');
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('action'); // created|updated|status_changed|merged|deleted
            $t->string('field')->nullable();
            $t->text('old_value')->nullable();
            $t->text('new_value')->nullable();
            $t->string('reason')->nullable();
            $t->timestamps();
            $t->index(['auditable_type', 'auditable_id']);
        });

        Schema::create('communication_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('lead_id')->nullable()->constrained()->nullOnDelete();
            $t->string('channel'); // call|whatsapp|email|sms
            $t->string('direction');
            $t->string('status');
            $t->json('meta')->nullable();
            $t->timestamps();
        });

        // --- Bulk import & merges (A5, B) ---
        Schema::create('lead_imports', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->string('filename')->nullable();
            $t->integer('total')->default(0);
            $t->integer('imported')->default(0);
            $t->integer('failed')->default(0);
            $t->integer('duplicates')->default(0);
            $t->json('error_log')->nullable();
            $t->string('status')->default('completed');
            $t->timestamps();
        });

        Schema::create('lead_merges', function (Blueprint $t) {
            $t->id();
            $t->foreignId('master_lead_id')->constrained('leads')->cascadeOnDelete();
            $t->unsignedBigInteger('merged_lead_id');
            $t->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $t->json('snapshot')->nullable();
            $t->timestamps();
        });

        // --- Channel Partners (scoped, Phase D foundation) ---
        Schema::create('channel_partners', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('company')->nullable();
            $t->string('email')->nullable();
            $t->string('phone')->nullable();
            $t->decimal('commission_rate', 5, 2)->default(0);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach ([
            'channel_partners','lead_merges','lead_imports','communication_logs','audit_logs',
            'automation_logs','automation_rules','scoring_rules','sequence_enrollments','sequence_steps',
            'sequences','templates','emails','whatsapp_messages','calls','tasks','activities','leads',
            'pipeline_stages','contacts','projects','password_reset_tokens','users','permission_role',
            'permissions','roles',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
