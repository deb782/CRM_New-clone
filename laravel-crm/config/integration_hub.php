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
        'description' => 'Send & receive WhatsApp messages, templates and media through the official Meta Cloud API. Use "Connect WhatsApp" (recommended) for embedded signup, or enter a permanent token manually.',
        'docs' => 'https://developers.facebook.com/docs/whatsapp/embedded-signup/',
        'fields' => [
            ['key' => 'app_id', 'label' => 'Meta App ID', 'type' => 'text', 'help' => 'For "Connect WhatsApp". App Dashboard → Settings → Basic.'],
            ['key' => 'config_id', 'label' => 'Embedded Signup Config ID', 'type' => 'text', 'help' => 'Facebook Login for Business → Configurations (WhatsApp Embedded Signup, incl. whatsapp_business_management + whatsapp_business_messaging).'],
            ['key' => 'graph_version', 'label' => 'Graph API Version', 'type' => 'text', 'default' => 'v21.0'],
            ['key' => 'access_token', 'label' => 'Permanent Access Token (auto-filled / manual)', 'type' => 'password', 'secret' => true, 'required' => true, 'help' => 'Set automatically after Connect WhatsApp, or paste a System-user token.'],
            ['key' => 'phone_number_id', 'label' => 'Phone Number ID (auto-filled / manual)', 'type' => 'text', 'required' => true],
            ['key' => 'waba_id', 'label' => 'WhatsApp Business Account ID (auto-filled / manual)', 'type' => 'text'],
            ['key' => 'verify_token', 'label' => 'Webhook Verify Token', 'type' => 'text', 'help' => 'Any string you set; used to verify the webhook.'],
            ['key' => 'app_secret', 'label' => 'App Secret', 'type' => 'password', 'secret' => true, 'help' => 'Server-only. Validates inbound webhook signatures and exchanges the signup code.'],
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
        'description' => 'Auto-capture leads from Facebook & Instagram Lead Ad forms in real time. Use "Connect with Facebook" (recommended) or enter a Page token manually. Webhook callback: '.rtrim((string) env('APP_URL'), '/').'/api/v1/webhooks/meta-leads',
        'docs' => 'https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving/',
        'fields' => [
            ['key' => 'app_id', 'label' => 'Meta App ID', 'type' => 'text', 'help' => 'For "Connect with Facebook". App Dashboard → Settings → Basic.'],
            ['key' => 'config_id', 'label' => 'Login for Business Config ID', 'type' => 'text', 'help' => 'Facebook Login for Business → Configurations (must include leads_retrieval, pages_show_list, pages_manage_metadata, pages_manage_ads, pages_read_engagement, business_management).'],
            ['key' => 'app_secret', 'label' => 'App Secret', 'type' => 'password', 'secret' => true, 'help' => 'Server-only. Also validates inbound webhook signatures.'],
            ['key' => 'verify_token', 'label' => 'Webhook Verify Token', 'type' => 'text', 'required' => true, 'help' => 'Any random string; enter the same value in Meta’s webhook setup.'],
            ['key' => 'graph_version', 'label' => 'Graph API Version', 'type' => 'text', 'default' => 'v21.0'],
            ['key' => 'page_id', 'label' => 'Page ID (auto-filled / manual)', 'type' => 'text', 'help' => 'Set automatically after Connect with Facebook.'],
            ['key' => 'page_access_token', 'label' => 'Page Access Token (auto-filled / manual)', 'type' => 'password', 'secret' => true],
        ],
    ],
];
