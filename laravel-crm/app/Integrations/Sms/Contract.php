<?php

namespace App\Integrations\Sms;

interface Contract
{
    /** @return array{id:?string, status:string} */
    public function send(string $phone, string $body): array;
}
