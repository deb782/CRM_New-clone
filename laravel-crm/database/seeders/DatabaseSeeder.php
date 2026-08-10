<?php

namespace Database\Seeders;

use App\Models\AutomationRule;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Permission;
use App\Models\Phase;
use App\Models\PipelineStage;
use App\Models\Plot;
use App\Models\Project;
use App\Models\Role;
use App\Models\ScoringRule;
use App\Models\Sequence;
use App\Models\SequenceStep;
use App\Models\Template;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->permissions();
        $roles = $this->roles();
        $this->users($roles);
        $this->stages();
        $projects = $this->projects();
        $this->scoringRules();
        $this->templates();
        $this->sequences();
        $this->automationRules();
        $this->paymentPlans();
        $this->demoData($projects);
        $this->inventory($projects);
        $this->channelPartners();
    }

    private function channelPartners(): void
    {
        $user = User::where('email', 'partner@crm.local')->first();
        $partner = \App\Models\ChannelPartner::updateOrCreate(
            ['name' => 'Prime Realty Partners'],
            ['company' => 'Prime Realty LLP', 'email' => 'partner@crm.local', 'phone' => '9000000007',
             'commission_rate' => 2.00, 'active' => true, 'user_id' => $user?->id]
        );
        // Attribute a handful of demo leads to this partner for the portal view
        \App\Models\Lead::whereNull('channel_partner_id')->orderBy('id')->limit(6)
            ->update(['channel_partner_id' => $partner->id]);
    }

    private function paymentPlans(): void
    {
        $plans = [
            ['Construction Linked (20-30-50)', 'CLP', 'On booking 20%, on slab 30%, on possession 50%', [
                ['label' => 'On Booking', 'pct' => 20], ['label' => 'On Foundation', 'pct' => 30], ['label' => 'On Possession', 'pct' => 50],
            ]],
            ['Down Payment (10-80-10)', 'DP', 'On booking 10%, within 45 days 80%, on possession 10%', [
                ['label' => 'On Booking', 'pct' => 10], ['label' => 'Within 45 Days', 'pct' => 80], ['label' => 'On Possession', 'pct' => 10],
            ]],
            ['Flexi (25-25-25-25)', 'FLEXI', 'Four equal milestones', [
                ['label' => 'On Booking', 'pct' => 25], ['label' => 'On Agreement', 'pct' => 25], ['label' => 'On Slab', 'pct' => 25], ['label' => 'On Possession', 'pct' => 25],
            ]],
        ];
        foreach ($plans as [$name, $code, $desc, $ms]) {
            \App\Models\PaymentPlan::updateOrCreate(['code' => $code], ['name' => $name, 'description' => $desc, 'milestones' => $ms, 'active' => true]);
        }
    }

    private function permissions(): void
    {
        $perms = [
            'leads.view' => 'View leads', 'leads.create' => 'Create leads', 'leads.edit' => 'Edit leads',
            'leads.delete' => 'Delete leads', 'leads.override' => 'Override/downgrade status',
            'projects.manage' => 'Manage projects', 'config.manage' => 'Manage configuration',
            'users.manage' => 'Manage users & roles', 'discounts.approve' => 'Approve discounts',
            'postsales.manage' => 'Manage post-sales / locked records',
            'partner.portal' => 'Channel-partner portal access',
            'workflow.manage' => 'Design & manage lead-flow workflows',
            'accounts.view' => 'View accounts / payments', 'accounts.manage' => 'Manage accounts / payments',
            'legal.view' => 'View legal / agreements', 'legal.manage' => 'Manage legal / agreements',
            'crm.view' => 'View customer relationship records', 'crm.manage' => 'Manage customer relationship records',
            'reports.sales' => 'View sales reports', 'reports.financial' => 'View financial reports',
            'reports.activity' => 'View activity & SLA reports',
        ];
        foreach ($perms as $key => $label) {
            Permission::firstOrCreate(['key' => $key], ['label' => $label, 'group' => explode('.', $key)[0]]);
        }
    }

    private function roles(): array
    {
        // Heads get full department access; Support gets view/create only (no edit/delete/override).
        $map = [
            'admin' => ['name' => 'Super Admin', 'department' => 'admin', 'tier' => 'super', 'perms' => 'all'],
            'process_admin' => ['name' => 'Process Admin', 'department' => 'admin', 'tier' => 'process', 'perms' => ['config.manage', 'users.manage', 'projects.manage', 'workflow.manage', 'leads.view', 'reports.sales', 'reports.financial', 'reports.activity']],
            'sales_head' => ['name' => 'Sales Head', 'department' => 'sales', 'tier' => 'head', 'perms' => ['leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.override', 'discounts.approve', 'projects.manage', 'reports.sales', 'reports.activity']],
            'sales_bdm' => ['name' => 'Business Development Manager', 'department' => 'sales', 'tier' => 'manager', 'perms' => ['leads.view', 'leads.create', 'leads.edit']],
            'sales_bde' => ['name' => 'Business Development Executive', 'department' => 'sales', 'tier' => 'exec', 'perms' => ['leads.view', 'leads.create', 'leads.edit']],
            'accounts_head' => ['name' => 'Accounts Head', 'department' => 'accounts', 'tier' => 'head', 'perms' => ['accounts.view', 'accounts.manage', 'postsales.manage', 'leads.view', 'reports.financial', 'reports.activity']],
            'accounts_support' => ['name' => 'Accounts Support', 'department' => 'accounts', 'tier' => 'support', 'perms' => ['accounts.view', 'leads.view']],
            'legal_head' => ['name' => 'Legal Head', 'department' => 'legal', 'tier' => 'head', 'perms' => ['legal.view', 'legal.manage', 'leads.view', 'reports.activity']],
            'legal_support' => ['name' => 'Legal Support', 'department' => 'legal', 'tier' => 'support', 'perms' => ['legal.view', 'leads.view']],
            'crm_head' => ['name' => 'CRM Head', 'department' => 'crm', 'tier' => 'head', 'perms' => ['crm.view', 'crm.manage', 'postsales.manage', 'leads.view', 'leads.edit', 'reports.activity']],
            'crm_support' => ['name' => 'CRM Support', 'department' => 'crm', 'tier' => 'support', 'perms' => ['crm.view', 'leads.view']],
            'channel_partner' => ['name' => 'Channel Partner', 'department' => 'partner', 'tier' => 'external', 'perms' => ['partner.portal']],
        ];
        $roles = [];
        foreach ($map as $slug => $cfg) {
            $role = Role::updateOrCreate(['slug' => $slug], [
                'name' => $cfg['name'],
                'department' => $cfg['department'],
                'tier' => $cfg['tier'],
            ]);
            $ids = $cfg['perms'] === 'all'
                ? Permission::pluck('id')->all()
                : Permission::whereIn('key', $cfg['perms'])->pluck('id')->all();
            $role->permissions()->sync($ids);
            $roles[$slug] = $role;
        }

        return $roles;
    }

    private function users(array $roles): void
    {
        $users = [
            ['name' => 'Super Admin', 'email' => 'admin@crm.local', 'password' => 'Admin@12345', 'role' => 'admin', 'phone' => '9000000001'],
            ['name' => 'Process Admin', 'email' => 'process@crm.local', 'password' => 'Demo@12345', 'role' => 'process_admin', 'phone' => '9000000010'],
            ['name' => 'Priya Sharma', 'email' => 'priya@crm.local', 'password' => 'Demo@12345', 'role' => 'sales_head', 'phone' => '9000000002'],
            ['name' => 'Karan Malhotra', 'email' => 'bdm@crm.local', 'password' => 'Demo@12345', 'role' => 'sales_bdm', 'phone' => '9000000008'],
            ['name' => 'Rahul Verma', 'email' => 'rahul@crm.local', 'password' => 'Demo@12345', 'role' => 'sales_bde', 'phone' => '9000000003'],
            ['name' => 'Aisha Khan', 'email' => 'aisha@crm.local', 'password' => 'Demo@12345', 'role' => 'sales_bde', 'phone' => '9000000004'],
            ['name' => 'Anil Gupta', 'email' => 'accountshead@crm.local', 'password' => 'Demo@12345', 'role' => 'accounts_head', 'phone' => '9000000011'],
            ['name' => 'Meena Rao', 'email' => 'accounts@crm.local', 'password' => 'Demo@12345', 'role' => 'accounts_support', 'phone' => '9000000012'],
            ['name' => 'Vivek Nair', 'email' => 'legalhead@crm.local', 'password' => 'Demo@12345', 'role' => 'legal_head', 'phone' => '9000000013'],
            ['name' => 'Sana Sheikh', 'email' => 'legal@crm.local', 'password' => 'Demo@12345', 'role' => 'legal_support', 'phone' => '9000000014'],
            ['name' => 'Deepa Menon', 'email' => 'crmhead@crm.local', 'password' => 'Demo@12345', 'role' => 'crm_head', 'phone' => '9000000015'],
            ['name' => 'Rohit Das', 'email' => 'crm@crm.local', 'password' => 'Demo@12345', 'role' => 'crm_support', 'phone' => '9000000016'],
            ['name' => 'Prime Realty (Partner)', 'email' => 'partner@crm.local', 'password' => 'Demo@12345', 'role' => 'channel_partner', 'phone' => '9000000007'],
        ];
        foreach ($users as $u) {
            User::updateOrCreate(['email' => $u['email']], [
                'name' => $u['name'],
                'password' => Hash::make($u['password']),
                'role_id' => $roles[$u['role']]->id,
                'phone' => $u['phone'],
                'is_active' => true,
            ]);
        }
        // Remove retired demo users no longer in the hierarchy
        User::whereIn('email', ['marketing@crm.local', 'cs@crm.local'])->delete();
        // Retire legacy roles now that all users are reassigned
        Role::whereIn('slug', ['sales_manager', 'sales_exec', 'marketing', 'crm_ops', 'post_sales'])->delete();
    }

    private function stages(): void
    {
        $stages = [
            ['New Lead', 'new_lead', 'positive'],
            ['Contacted', 'contacted', 'positive'],
            ['Interested', 'interested', 'positive'],
            ['Opportunity', 'opportunity', 'positive'],
            ['Site Visit Scheduled', 'site_visit_scheduled', 'positive'],
            ['Site Visit Completed', 'site_visit_completed', 'positive'],
            ['Negotiation', 'negotiation', 'positive'],
            ['Won', 'won', 'positive'],
            ['Lost', 'lost', 'negative'],
            ['Not Interested', 'not_interested', 'negative'],
            ['No Response', 'no_response', 'special'],
        ];
        foreach ($stages as $i => [$name, $slug, $type]) {
            PipelineStage::updateOrCreate(['slug' => $slug], [
                'name' => $name,
                'sort_order' => $i + 1,
                'type' => $type,
                'is_won' => $slug === 'won',
                'is_lost' => in_array($slug, ['lost', 'not_interested']),
            ]);
        }
    }

    private function projects(): array
    {
        $data = [
            ['name' => 'Skyline Residences', 'code' => 'SKY', 'city' => 'Bengaluru', 'zone' => 'Whitefield', 'unit_types' => ['1BHK', '2BHK', '3BHK'], 'price_min' => 5000000, 'price_max' => 12000000],
            ['name' => 'Green Valley Plots', 'code' => 'GVP', 'city' => 'Bengaluru', 'zone' => 'Devanahalli', 'unit_types' => ['Plot'], 'price_min' => 3000000, 'price_max' => 8000000],
            ['name' => 'Marina Heights', 'code' => 'MAR', 'city' => 'Chennai', 'zone' => 'OMR', 'unit_types' => ['2BHK', '3BHK'], 'price_min' => 7000000, 'price_max' => 15000000],
        ];
        $projects = [];
        foreach ($data as $p) {
            $projects[] = Project::updateOrCreate(['code' => $p['code']], $p);
        }
        return $projects;
    }

    private function scoringRules(): void
    {
        $rules = [
            ['qualification', 'Budget confirmed', 'budget_confirmed', '=', '1', 15],
            ['qualification', 'Timeline clear', 'timeline_clear', '=', '1', 15],
            ['qualification', 'Location specified', 'location_specified', '=', '1', 10],
            ['qualification', 'Decision maker identified', 'decision_maker', 'exists', null, 10],
            ['engagement', 'Email opened', 'email_opens', '>=', '1', 5],
            ['engagement', 'Email clicked', 'email_clicks', '>=', '1', 10],
            ['engagement', 'Message responses', 'message_responses', '>=', '1', 20],
            ['responsiveness', 'Contact verified', 'contact_verified', '=', '1', 10],
            ['responsiveness', 'Call connected', 'calls_connected', '>=', '1', 10],
            ['recency', 'Contacted within 7 days', 'days_since_contact', '<=', '7', 20],
            ['recency', 'Contacted within 14 days', 'days_since_contact', '<=', '14', 10],
            ['source', 'Walk-in / referral', 'source', 'in', 'Walk-in,Referral', 15],
            ['source', 'Paid ad', 'source', 'in', 'Meta,Facebook,Instagram', 10],
            ['source', 'Organic / website', 'source', 'in', 'Website Form,Organic', 5],
        ];
        foreach ($rules as [$cat, $factor, $field, $op, $val, $pts]) {
            ScoringRule::updateOrCreate(
                ['category' => $cat, 'field' => $field, 'value' => $val],
                ['factor' => $factor, 'operator' => $op, 'points' => $pts, 'active' => true]
            );
        }
    }

    private function templates(): void
    {
        $tpls = [
            ['Welcome WhatsApp', 'welcome_wa', 'whatsapp', null, 'Hi {{name}}! Thanks for your interest in {{project}}. Our team will reach out shortly. Reply STOP to opt out.'],
            ['Brochure Share', 'brochure_wa', 'whatsapp', null, 'Hi {{name}}, here is the brochure & floor plan for {{project}}. Would you like to schedule a site visit?'],
            ['Site Visit Reminder', 'visit_reminder_wa', 'whatsapp', null, 'Reminder: Your site visit for {{project}} is coming up. Our team looks forward to meeting you!'],
            ['Welcome Email', 'welcome_email', 'email', 'Welcome to {{project}}', "Hi {{name}},\n\nThank you for your interest. Explore our options and let us know a good time to connect.\n\nRegards,\nSales Team"],
            ['Nurture Update', 'nurture_email', 'email', 'An update you will love', "Hi {{name}},\n\nWe have new offers and updates on {{project}}. Reply to know more.\n\nRegards,\nSales Team"],
        ];
        foreach ($tpls as [$name, $slug, $channel, $subject, $body]) {
            Template::updateOrCreate(['slug' => $slug], compact('name', 'channel', 'subject', 'body') + ['active' => true]);
        }
    }

    private function sequences(): void
    {
        $defs = [
            'hot' => ['name' => 'Hot Lead Cadence', 'steps' => [
                [1, 0, 'whatsapp', 'Hi {{name}}, great speaking with you! Here are the details for {{project}}.'],
                [2, 24, 'email', 'Following up — ready to schedule your visit to {{project}}?'],
                [3, 24, 'whatsapp', 'Hi {{name}}, any questions on pricing or payment plans?'],
                [4, 48, 'email', 'Exclusive offer available this week for {{project}}.'],
                [5, 48, 'whatsapp', 'Checking in {{name}} — shall we lock a site visit slot?'],
                [6, 48, 'email', 'Final reminder: limited units left at {{project}}.'],
            ]],
            'warm' => ['name' => 'Warm Lead Cadence', 'steps' => [
                [1, 0, 'email', 'Thanks for your interest in {{project}}, {{name}}.'],
                [2, 72, 'whatsapp', 'Hi {{name}}, sharing a quick video tour of {{project}}.'],
                [3, 72, 'email', 'Financing options made simple for {{project}}.'],
                [4, 72, 'whatsapp', 'Testimonials from happy owners at {{project}}.'],
                [5, 168, 'email', 'Still thinking? Here is what makes {{project}} special.'],
                [6, 168, 'whatsapp', 'Hi {{name}}, happy to answer any questions on {{project}}.'],
            ]],
            'cold' => ['name' => 'Cold Lead Cadence', 'steps' => [
                [1, 0, 'email', 'Welcome {{name}} — helpful resources for your home search.'],
                [2, 168, 'email', 'Buying guide: everything about {{project}}.'],
                [3, 168, 'whatsapp', 'Hi {{name}}, market update on {{project}}.'],
                [4, 168, 'email', 'New offers you might like at {{project}}.'],
                [5, 336, 'email', 'Checking in — anything we can help with?'],
                [6, 336, 'whatsapp', 'Hi {{name}}, still interested in {{project}}?'],
            ]],
        ];
        foreach ($defs as $temp => $def) {
            $seq = Sequence::updateOrCreate(['temperature' => $temp], ['name' => $def['name'], 'active' => true]);
            $seq->steps()->delete();
            foreach ($def['steps'] as [$no, $offset, $channel, $body]) {
                SequenceStep::create([
                    'sequence_id' => $seq->id, 'step_no' => $no, 'offset_hours' => $offset,
                    'channel' => $channel, 'subject' => $channel === 'email' ? substr($body, 0, 60) : null, 'body' => $body,
                ]);
            }
        }
    }

    private function automationRules(): void
    {
        AutomationRule::updateOrCreate(['name' => 'Welcome on capture'], [
            'event' => 'lead.created', 'conditions' => [],
            'actions' => [['type' => 'send_whatsapp', 'body' => 'Hi {{name}}, thanks for reaching out! Our team will contact you shortly.']],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Qualify on Interested'], [
            'event' => 'status.changed', 'conditions' => ['to' => 'interested'],
            'actions' => [
                ['type' => 'create_task', 'title' => 'Qualify for Site Visit', 'task_type' => 'follow_up', 'due_in_hours' => 24, 'priority' => 'high'],
                ['type' => 'send_email', 'subject' => 'Next steps in your journey', 'body' => 'Hi {{name}}, here are the next steps to move forward with {{project}}.'],
            ],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Handover on Opportunity'], [
            'event' => 'status.changed', 'conditions' => ['to' => 'opportunity'],
            'actions' => [
                ['type' => 'create_task', 'title' => 'Sales Rep - Initial Contact within 24h', 'task_type' => 'follow_up', 'due_in_hours' => 24, 'priority' => 'high'],
                ['type' => 'send_email', 'subject' => 'Welcome from our Sales team', 'body' => 'Hi {{name}}, our sales team will assist you with {{project}} from here.'],
            ],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Proposal on Negotiation'], [
            'event' => 'status.changed', 'conditions' => ['to' => 'negotiation'],
            'actions' => [
                ['type' => 'create_task', 'title' => 'Prepare & send proposal / cost sheet', 'task_type' => 'follow_up', 'due_in_hours' => 24, 'priority' => 'high'],
                ['type' => 'send_whatsapp', 'body' => 'Hi {{name}}, we are preparing your personalised proposal and will share it shortly.'],
            ],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Onboard on Won'], [
            'event' => 'status.changed', 'conditions' => ['to' => 'won'],
            'actions' => [
                ['type' => 'create_task', 'title' => 'Post-sales onboarding & document collection', 'task_type' => 'follow_up', 'due_in_hours' => 24, 'priority' => 'high'],
                ['type' => 'send_email', 'subject' => 'Welcome aboard!', 'body' => 'Hi {{name}}, congratulations on your booking with {{project}}. Your onboarding begins now.'],
            ],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Pause on Not Interested'], [
            'event' => 'status.changed', 'conditions' => ['to' => ['not_interested', 'lost']],
            'actions' => [['type' => 'pause_sequence', 'reason' => 'lead closed / not interested']],
            'active' => true,
        ]);
        AutomationRule::updateOrCreate(['name' => 'Reply follow-up on WhatsApp'], [
            'event' => 'whatsapp.replied', 'conditions' => [],
            'actions' => [['type' => 'create_task', 'title' => 'Respond to WhatsApp reply', 'task_type' => 'follow_up', 'due_in_hours' => 2, 'priority' => 'high']],
            'active' => true,
        ]);
    }

    private function demoData(array $projects): void
    {
        $exec = User::where('email', 'rahul@crm.local')->first();
        $exec2 = User::where('email', 'aisha@crm.local')->first();
        $stages = PipelineStage::pluck('id', 'slug');

        $contacts = [
            ['name' => 'Vikram Nair', 'email' => 'vikram@example.com', 'phone' => '9812345670', 'city' => 'Bengaluru'],
            ['name' => 'Sneha Reddy', 'email' => 'sneha@example.com', 'phone' => '9812345671', 'city' => 'Chennai'],
            ['name' => 'Arjun Mehta', 'email' => 'arjun@example.com', 'phone' => '9812345672', 'city' => 'Bengaluru'],
            ['name' => 'Divya Iyer', 'email' => 'divya@example.com', 'phone' => '9812345673', 'city' => 'Chennai'],
        ];
        foreach ($contacts as $c) {
            Contact::updateOrCreate(['email' => $c['email']], $c);
        }

        $leads = [
            ['name' => 'Vikram Nair', 'email' => 'vikram@example.com', 'phone' => '9812345670', 'source' => 'Website Form', 'stage' => 'opportunity', 'temperature' => 'hot', 'score' => 82, 'owner' => $exec?->id, 'project' => $projects[0]->id, 'city' => 'Bengaluru', 'interest_level' => 'very_high', 'budget_min' => 6000000, 'budget_max' => 9000000, 'timeline' => 'immediate', 'financing' => 'loan', 'decision_maker' => 'self', 'preferred_location' => 'Whitefield', 'contact_verified' => true],
            ['name' => 'Sneha Reddy', 'email' => 'sneha@example.com', 'phone' => '9812345671', 'source' => 'Meta', 'campaign' => 'Diwali Offer', 'stage' => 'interested', 'temperature' => 'warm', 'score' => 55, 'owner' => $exec2?->id, 'project' => $projects[2]->id, 'city' => 'Chennai', 'interest_level' => 'high', 'budget_min' => 8000000, 'timeline' => '3-6m', 'financing' => 'mixed', 'decision_maker' => 'family', 'preferred_location' => 'OMR', 'contact_verified' => true],
            ['name' => 'Arjun Mehta', 'email' => 'arjun@example.com', 'phone' => '9812345672', 'source' => 'Walk-in', 'stage' => 'contacted', 'temperature' => 'warm', 'score' => 48, 'owner' => $exec?->id, 'project' => $projects[1]->id, 'city' => 'Bengaluru', 'interest_level' => 'medium', 'timeline' => '6-12m', 'financing' => 'cash', 'preferred_location' => 'Devanahalli'],
            ['name' => 'Divya Iyer', 'email' => 'divya@example.com', 'phone' => '9812345673', 'source' => 'Website Form', 'stage' => 'new_lead', 'temperature' => 'cold', 'score' => 20, 'owner' => $exec2?->id, 'project' => $projects[2]->id, 'city' => 'Chennai', 'interest_level' => 'low', 'timeline' => 'later'],
        ];
        foreach ($leads as $l) {
            Lead::updateOrCreate(['email' => $l['email']], [
                'name' => $l['name'], 'phone' => $l['phone'], 'source' => $l['source'],
                'campaign' => $l['campaign'] ?? null, 'city' => $l['city'] ?? null,
                'pipeline_stage_id' => $stages[$l['stage']] ?? null, 'status' => $l['stage'],
                'owner_id' => $l['owner'], 'project_id' => $l['project'] ?? null,
                'temperature' => $l['temperature'], 'score' => $l['score'],
                'interest_level' => $l['interest_level'] ?? null,
                'budget_min' => $l['budget_min'] ?? null, 'budget_max' => $l['budget_max'] ?? null,
                'timeline' => $l['timeline'] ?? null, 'financing' => $l['financing'] ?? null,
                'decision_maker' => $l['decision_maker'] ?? null,
                'preferred_location' => $l['preferred_location'] ?? null,
                'contact_verified' => $l['contact_verified'] ?? false,
                'last_contacted_at' => now()->subDays(rand(1, 6)),
                'acknowledged_at' => now()->subDays(rand(1, 6)),
            ]);
        }
    }

    private function inventory(array $projects): void
    {
        $blueprints = [
            // project index => [ [phase name, code, possession, [unit_type, count, base_price, area], ... ] ]
            0 => [ // Skyline Residences (apartments)
                ['Tower A', 'A', 'Dec 2027', [['2BHK', 6, 7500000, 1150], ['3BHK', 4, 11000000, 1650]]],
                ['Tower B', 'B', 'Jun 2028', [['1BHK', 6, 5200000, 720], ['2BHK', 6, 7800000, 1180]]],
            ],
            1 => [ // Green Valley Plots
                ['Sector 1', 'S1', 'Ready', [['Plot', 10, 3500000, 1200]]],
                ['Sector 2', 'S2', 'Ready', [['Plot', 8, 4800000, 1500]]],
            ],
            2 => [ // Marina Heights
                ['Phase 1', 'P1', 'Mar 2028', [['2BHK', 6, 9000000, 1250], ['3BHK', 5, 14000000, 1800]]],
            ],
        ];
        $facings = ['East', 'West', 'North', 'South', 'North-East'];
        foreach ($blueprints as $pi => $phases) {
            $project = $projects[$pi] ?? null;
            if (! $project) continue;
            foreach ($phases as $order => [$pname, $pcode, $possession, $units]) {
                $phase = Phase::updateOrCreate(
                    ['project_id' => $project->id, 'name' => $pname],
                    ['code' => $pcode, 'sort_order' => $order + 1, 'possession_target' => $possession, 'status' => 'active']
                );
                if ($phase->plots()->count() > 0) continue;
                foreach ($units as [$type, $count, $base, $area]) {
                    for ($i = 1; $i <= $count; $i++) {
                        $num = $pcode.'-'.str_pad((string) $i, 3, '0', STR_PAD_LEFT);
                        $rand = rand(0, 100);
                        $status = $rand < 60 ? 'available' : ($rand < 78 ? 'held' : ($rand < 92 ? 'booked' : 'sold'));
                        Plot::create([
                            'project_id' => $project->id, 'phase_id' => $phase->id, 'number' => $num,
                            'unit_type' => $type, 'carpet_area' => $area, 'built_up_area' => round($area * 1.25),
                            'floor' => $type === 'Plot' ? null : (string) rand(1, 12),
                            'facing' => $facings[array_rand($facings)],
                            'price' => $base + rand(0, 8) * 100000,
                            'status' => $status,
                        ]);
                    }
                }
            }
        }
    }
}
