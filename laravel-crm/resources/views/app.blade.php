<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Agrocorp CRM</title>
    <link rel="icon" type="image/png" href="{{ asset('assets/img/agrocorp-mark.png') }}">
    <link rel="apple-touch-icon" href="{{ asset('assets/img/agrocorp-mark.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Chivo:wght@700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{{ asset('assets/vendor/drawflow.min.css') }}">
    <link rel="stylesheet" href="{{ asset('assets/css/workflow.css') }}?v=1">
    <link rel="stylesheet" href="{{ asset('assets/css/lead-cockpit.css') }}?v=1">
    <link rel="stylesheet" href="{{ asset('assets/css/datepicker.css') }}?v=1">
    <link rel="stylesheet" href="{{ asset('assets/css/journey.css') }}?v=1">
    <link rel="stylesheet" href="{{ asset('assets/css/tracker.css') }}?v=1">
    <link rel="stylesheet" href="{{ asset('assets/css/app.css') }}?v=17">
    <link rel="stylesheet" href="{{ asset('assets/css/dashboard.css') }}?v=2">
    <link rel="stylesheet" href="{{ asset('assets/css/cockpit.css') }}?v=3">
    <link rel="stylesheet" href="{{ asset('assets/css/webcapture.css') }}?v=1">
</head>
<body>
    <div id="app"></div>
    <div id="toast" class="toast-wrap" data-testid="toast-wrap"></div>
    <div id="modal-root"></div>

    <script src="{{ asset('assets/vendor/drawflow.min.js') }}"></script>
    <script>window.CRM = { API: (location.port === '8000' ? '/api/v1' : '/crm-api/v1'), asset: '{{ asset('assets') }}' };</script>
    <script src="{{ asset('assets/js/api.js') }}?v=11"></script>
    <script src="{{ asset('assets/js/dashboard.js') }}?v=18"></script>
    <script src="{{ asset('assets/js/sales-cockpit.js') }}?v=4"></script>
    <script src="{{ asset('assets/js/leads.js') }}?v=17"></script>
    <script src="{{ asset('assets/js/datepicker.js') }}?v=1"></script>
    <script src="{{ asset('assets/js/inventory.js') }}?v=12"></script>
    <script src="{{ asset('assets/js/deals.js') }}?v=11"></script>
    <script src="{{ asset('assets/js/finance-ops.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/partners-admin.js') }}?v=1"></script>
    <script src="{{ asset('assets/js/config.js') }}?v=12"></script>
    <script src="{{ asset('assets/js/whatsapp.js') }}?v=17"></script>
    <script src="{{ asset('assets/js/wa-flows.js') }}?v=4"></script>
    <script src="{{ asset('assets/js/wa-inbound.js') }}?v=1"></script>
    <script src="{{ asset('assets/js/wa-campaigns.js') }}?v=1"></script>
    <script src="{{ asset('assets/js/email.js') }}?v=21"></script>
    <script src="{{ asset('assets/js/onboarding.js') }}?v=23"></script>
    <script src="{{ asset('assets/vendor/sortable.min.js') }}"></script>
    <script src="{{ asset('assets/js/journey.js') }}?v=7"></script>
    <script src="{{ asset('assets/js/journey-msgs.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/profile.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/people.js') }}?v=4"></script>
    <script src="{{ asset('assets/js/integrations.js') }}?v=6"></script>
    <script src="{{ asset('assets/js/notifications.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/reports.js') }}?v=1"></script>
    <script src="{{ asset('assets/js/forms-ui.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/chatbot-ui.js') }}?v=5"></script>
    <script src="{{ asset('assets/js/webcapture.js') }}?v=2"></script>
    <script src="{{ asset('assets/js/app.js') }}?v=37"></script>
</body>
</html>
