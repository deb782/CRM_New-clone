<?php

// Registry of self-service integrations shown in the Integrations Hub.
// Adding a new provider = add an entry here (+ a test method in IntegrationController).
return [
    'meta_whatsapp' => [
        'name' => 'Meta WhatsApp Cloud',
        'category' => 'Messaging',
        'icon' => 'fa-whatsapp',
        'icon_style' => 'brand',
        'accent' => '#25D366',
        'description' => 'Send & receive WhatsApp messages, templates and media through the official Meta Cloud API.',
        'docs' => 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
        'fields' => [
            ['key' => 'access_token', 'label' => 'Permanent Access Token', 'type' => 'password', 'secret' => true, 'required' => true, 'help' => 'System-user token from Meta Business Settings.'],
            ['key' => 'phone_number_id', 'label' => 'Phone Number ID', 'type' => 'text', 'required' => true],
            ['key' => 'waba_id', 'label' => 'WhatsApp Business Account ID', 'type' => 'text'],
            ['key' => 'verify_token', 'label' => 'Webhook Verify Token', 'type' => 'text', 'help' => 'Any string you set; used to verify the webhook.'],
            ['key' => 'app_secret', 'label' => 'App Secret', 'type' => 'password', 'secret' => true, 'help' => 'Used to validate inbound webhook signatures.'],
        ],
    ],
    'google_email' => [
        'name' => 'Google Workspace Email',
        'category' => 'Email',
        'icon' => 'fa-envelope',
        'icon_style' => 'solid',
        'accent' => '#EA4335',
        'description' => 'Deliver transactional and broadcast email from your Google Workspace mailbox via SMTP.',
        'docs' => 'https://support.google.com/mail/answer/185833',
        'fields' => [
            ['key' => 'host', 'label' => 'SMTP Host', 'type' => 'text', 'required' => true, 'default' => 'smtp.gmail.com'],
            ['key' => 'port', 'label' => 'Port', 'type' => 'text', 'required' => true, 'default' => '587'],
            ['key' => 'username', 'label' => 'Mailbox (username)', 'type' => 'text', 'required' => true, 'placeholder' => 'crm@yourdomain.com'],
            ['key' => 'app_password', 'label' => 'App Password', 'type' => 'password', 'secret' => true, 'required' => true, 'help' => '16-character App Password (not your login password).'],
            ['key' => 'from_name', 'label' => 'From Name', 'type' => 'text', 'placeholder' => 'Acme Realty'],
            ['key' => 'from_email', 'label' => 'From Email', 'type' => 'text', 'placeholder' => 'defaults to mailbox'],
        ],
    ],
    'mcube' => [
        'name' => 'Mcube Telephony',
        'category' => 'Telephony',
        'icon' => 'fa-phone-volume',
        'icon_style' => 'solid',
        'accent' => '#2f5bea',
        'description' => 'Click-to-call, call routing and recordings for the sales team via Mcube.',
        'docs' => 'https://mcube.com',
        'fields' => [
            ['key' => 'base_url', 'label' => 'API Base URL', 'type' => 'text', 'required' => true, 'placeholder' => 'https://api.mcube.com'],
            ['key' => 'auth_token', 'label' => 'API Token / Key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['key' => 'caller_id', 'label' => 'Outbound Caller ID (DID)', 'type' => 'text'],
        ],
    ],
    'meta_lead_ads' => [
        'name' => 'Meta Lead Ads',
        'category' => 'Lead Capture',
        'icon' => 'fa-facebook',
        'icon_style' => 'brand',
        'accent' => '#0866FF',
        'description' => 'Auto-capture leads from Facebook & Instagram Lead Ad forms in real time. Point Meta’s Page "leadgen" webhook to:  '.rtrim((string) env('APP_URL'), '/').'/api/v1/webhooks/meta-leads  and subscribe the Page to the leadgen field.',
        'docs' => 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/',
        'fields' => [
            ['key' => 'page_id', 'label' => 'Facebook Page ID', 'type' => 'text', 'required' => true],
            ['key' => 'page_access_token', 'label' => 'Page Access Token', 'type' => 'password', 'secret' => true, 'required' => true, 'help' => 'Long-lived Page token with leads_retrieval + pages_manage_ads.'],
            ['key' => 'verify_token', 'label' => 'Webhook Verify Token', 'type' => 'text', 'required' => true, 'help' => 'Any random string; enter the same value in Meta’s webhook setup.'],
            ['key' => 'app_secret', 'label' => 'App Secret', 'type' => 'password', 'secret' => true, 'help' => 'Used to validate inbound webhook signatures (X-Hub-Signature-256).'],
            ['key' => 'graph_version', 'label' => 'Graph API Version', 'type' => 'text', 'default' => 'v21.0'],
        ],
    ],
];
