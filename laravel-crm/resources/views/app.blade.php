<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Real Estate CRM</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="{{ asset('assets/css/app.css') }}?v=4">
</head>
<body>
    <div id="app"></div>
    <div id="toast" class="toast-wrap" data-testid="toast-wrap"></div>
    <div id="modal-root"></div>

    <script>window.CRM = { API: '/api/v1', asset: '{{ asset('assets') }}' };</script>
    <script src="{{ asset('assets/js/api.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/dashboard.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/leads.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/inventory.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/deals.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/config.js') }}?v=10"></script>
    <script src="{{ asset('assets/js/whatsapp.js') }}?v=14"></script>
    <script src="{{ asset('assets/js/email.js') }}?v=21"></script>
    <script src="{{ asset('assets/js/onboarding.js') }}?v=21"></script>
    <script src="{{ asset('assets/js/app.js') }}?v=21"></script>
</body>
</html>
