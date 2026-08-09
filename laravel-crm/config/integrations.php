<?php

return [
    'whatsapp' => [
        'driver' => env('WHATSAPP_DRIVER', 'mock'),
        'wati' => [
            'base_url' => env('WATI_BASE_URL'),
            'token' => env('WATI_API_TOKEN'),
        ],
        'cloud' => [
            'token' => env('CLOUD_API_TOKEN'),
            'phone_id' => env('CLOUD_API_PHONE_ID'),
        ],
    ],

    'telephony' => [
        'driver' => env('TELEPHONY_DRIVER', 'mock'),
        'exotel' => [
            'sid' => env('EXOTEL_SID'),
            'token' => env('EXOTEL_TOKEN'),
            'caller_id' => env('EXOTEL_CALLER_ID'),
        ],
    ],

    'email' => [
        'driver' => env('EMAIL_DRIVER', 'smtp'),
    ],

    'webhook_secret' => env('WEBHOOK_SECRET', 'crm-webhook-secret'),

    // SLA / cadence knobs (build.docx A–H)
    'sla' => [
        'ack_minutes' => 5,          // A: auto-acknowledgement <= 5 min
        'verify_hours' => 2,         // C: escalation if verify task not started in 2h
        'over_contact_daily' => 2,   // F: max attempts/day without engagement
    ],
];
