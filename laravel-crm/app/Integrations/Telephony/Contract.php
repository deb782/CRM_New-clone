<?php

namespace App\Integrations\Telephony;

interface Contract
{
    /**
     * Initiate a click-to-call.
     * @return array{call_id:?string, status:string}
     */
    public function call(string $agentPhone, string $customerPhone): array;
}
