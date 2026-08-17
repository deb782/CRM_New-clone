<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Channel Partner Portal — Agrocorp</title>
    <link rel="icon" type="image/png" href="{{ asset('assets/img/agrocorp-mark.png') }}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="{{ asset('assets/css/cp-portal.css') }}?v=1">
</head>
<body>
    <div id="cp-app"></div>
    <div id="cp-toast" class="cp-toast-wrap"></div>
    <div id="cp-modal-root"></div>
    <script>window.CP = { API: (location.port === '8000' ? '/api/v1' : '/crm-api/v1'), asset: '{{ asset('assets') }}' };</script>
    <script src="{{ asset('assets/js/cp-portal.js') }}?v=3"></script>
</body>
</html>
