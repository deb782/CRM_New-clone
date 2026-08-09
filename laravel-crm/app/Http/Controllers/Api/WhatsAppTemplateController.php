<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Integrations\WhatsApp\Contract;
use App\Models\WhatsappTemplate;

class WhatsAppTemplateController extends Controller
{
    public function index()
    {
        return response()->json(['templates' => WhatsappTemplate::orderBy('name')->get()]);
    }

    /** Pull approved templates from the provider (Meta live, or mock samples) and upsert locally. */
    public function sync(Contract $driver)
    {
        $fetched = $driver->fetchTemplates();
        $count = 0;
        foreach ($fetched as $t) {
            WhatsappTemplate::updateOrCreate(
                ['name' => $t['name'], 'language' => $t['language'] ?? 'en_US'],
                [
                    'category' => $t['category'] ?? 'UTILITY',
                    'body' => $t['body'] ?? null,
                    'status' => $t['status'] ?? 'APPROVED',
                    'synced_at' => now(),
                ]
            );
            $count++;
        }

        return response()->json(['synced' => $count, 'templates' => WhatsappTemplate::orderBy('name')->get()]);
    }
}
