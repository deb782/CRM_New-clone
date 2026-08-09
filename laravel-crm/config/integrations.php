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

    'razorpay' => [
        'key_id' => env('RAZORPAY_KEY_ID'),
        'key_secret' => env('RAZORPAY_KEY_SECRET'),
        'webhook_secret' => env('RAZORPAY_WEBHOOK_SECRET'),
    ],

    'sms' => [
        'driver' => env('SMS_DRIVER', 'mock'), // mock|http
        'gateway' => [
            'url' => env('SMS_GATEWAY_URL'),
            'api_key' => env('SMS_GATEWAY_KEY'),
            'sender' => env('SMS_SENDER_ID'),
            'to_field' => env('SMS_TO_FIELD', 'to'),
            'body_field' => env('SMS_BODY_FIELD', 'message'),
            'from_field' => env('SMS_FROM_FIELD', 'from'),
        ],
    ],

    'esign' => [
        'driver' => env('ESIGN_DRIVER', 'mock'), // mock|<provider>
    ],

    'chatbot' => [
        'llm' => env('CHATBOT_LLM', false), // set true to use Emergent LLM key
    ],

    'webhook_secret' => env('WEBHOOK_SECRET', 'crm-webhook-secret'),

    // Post-sales payments (Sections N–Q)
    'payments' => [
        'milestone_interval_days' => (int) env('MILESTONE_INTERVAL_DAYS', 30),
        'reminder_days' => [30, 15, 7, 1],
        'late_interest_annual_pct' => (float) env('LATE_INTEREST_ANNUAL_PCT', 18),
        'allotment_trigger_pct' => (float) env('ALLOTMENT_TRIGGER_PCT', 10),
        'afs_review_days' => (int) env('AFS_REVIEW_DAYS', 5),
    ],

    // SLA / cadence knobs (build.docx A–H)
    'sla' => [
        'ack_minutes' => 5,          // A: auto-acknowledgement <= 5 min
        'verify_hours' => 2,         // C: escalation if verify task not started in 2h
        'over_contact_daily' => 2,   // F: max attempts/day without engagement
    ],
];
