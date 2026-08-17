<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Extend channel_partners with separate-login auth + KYC.
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->string('cp_code')->nullable()->unique()->after('id');
            $t->string('contact_name')->nullable()->after('company');
            $t->string('contact_email')->nullable()->unique()->after('contact_name');
            $t->string('contact_designation')->nullable()->after('contact_email');
            $t->string('password_hash')->nullable()->after('contact_designation');
            $t->string('status')->default('pending')->after('active'); // pending|approved|suspended
            $t->boolean('must_change_password')->default(true)->after('status');
            $t->timestamp('last_login_at')->nullable();
            // KYC
            $t->text('registered_address')->nullable();
            $t->string('entity_type')->nullable();
            $t->string('nature_of_business')->nullable();
            $t->string('gstin')->nullable();
            $t->string('pan')->nullable();
            $t->string('rera_number')->nullable();
            $t->string('bank_account_name')->nullable();
            $t->string('bank_name')->nullable();
            $t->string('bank_account_number')->nullable();
            $t->string('bank_ifsc')->nullable();
            $t->string('bank_account_type')->nullable();
            $t->string('signature_name')->nullable();
            $t->string('signature_designation')->nullable();
            $t->string('kyc_status')->default('incomplete'); // incomplete|submitted|approved
            $t->timestamp('kyc_submitted_at')->nullable();
            $t->timestamp('kyc_approved_at')->nullable();
        });

        Schema::create('cp_representatives', function (Blueprint $t) {
            $t->id();
            $t->foreignId('channel_partner_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('phone')->nullable();
            $t->string('email')->nullable();
            $t->string('status')->default('active'); // active|inactive
            $t->timestamps();
        });

        Schema::create('cp_leads', function (Blueprint $t) {
            $t->id();
            $t->foreignId('channel_partner_id')->constrained()->cascadeOnDelete();
            $t->foreignId('cp_representative_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $t->string('customer_name');
            $t->string('phone');
            $t->string('email')->nullable();
            $t->string('plot_type')->nullable();
            $t->string('source')->default('Channel Partner Portal');
            $t->text('notes')->nullable();
            $t->string('status')->default('new'); // new|contacted|qualified|converted|rejected|lost
            $t->text('admin_notes')->nullable();
            $t->foreignId('converted_lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $t->timestamps();
            $t->index('status');
            $t->index('channel_partner_id');
        });

        Schema::create('cp_lead_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cp_lead_id')->constrained()->cascadeOnDelete();
            $t->string('old_status')->nullable();
            $t->string('new_status');
            $t->string('note')->nullable();
            $t->string('actor_type')->default('system'); // partner|admin|system
            $t->unsignedBigInteger('actor_id')->nullable();
            $t->timestamps();
        });

        Schema::create('cp_documents', function (Blueprint $t) {
            $t->id();
            $t->string('title');
            $t->string('category')->nullable();
            $t->string('file_path'); // object storage url
            $t->boolean('active')->default(true);
            $t->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('cp_tickets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('channel_partner_id')->constrained()->cascadeOnDelete();
            $t->string('subject');
            $t->string('status')->default('open'); // open|in_progress|resolved|closed
            $t->string('priority')->default('normal'); // low|normal|high
            $t->timestamp('last_reply_at')->nullable();
            $t->timestamps();
            $t->index('status');
        });

        Schema::create('cp_ticket_messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cp_ticket_id')->constrained()->cascadeOnDelete();
            $t->string('sender_type'); // partner|admin
            $t->unsignedBigInteger('sender_id')->nullable();
            $t->text('body');
            $t->timestamps();
        });

        Schema::create('cp_password_resets', function (Blueprint $t) {
            $t->id();
            $t->foreignId('channel_partner_id')->constrained()->cascadeOnDelete();
            $t->string('token');
            $t->timestamp('expires_at');
            $t->timestamp('used_at')->nullable();
            $t->timestamps();
            $t->index('token');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cp_password_resets');
        Schema::dropIfExists('cp_ticket_messages');
        Schema::dropIfExists('cp_tickets');
        Schema::dropIfExists('cp_documents');
        Schema::dropIfExists('cp_lead_events');
        Schema::dropIfExists('cp_leads');
        Schema::dropIfExists('cp_representatives');
        Schema::table('channel_partners', function (Blueprint $t) {
            $t->dropUnique(['cp_code']);
            $t->dropUnique(['contact_email']);
            $t->dropColumn([
                'cp_code', 'contact_name', 'contact_email', 'contact_designation', 'password_hash',
                'status', 'must_change_password', 'last_login_at', 'registered_address', 'entity_type',
                'nature_of_business', 'gstin', 'pan', 'rera_number', 'bank_account_name', 'bank_name',
                'bank_account_number', 'bank_ifsc', 'bank_account_type', 'signature_name',
                'signature_designation', 'kyc_status', 'kyc_submitted_at', 'kyc_approved_at',
            ]);
        });
    }
};
