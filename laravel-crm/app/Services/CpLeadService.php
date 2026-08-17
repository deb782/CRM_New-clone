<?php

namespace App\Services;

use App\Models\CpLead;
use App\Models\CpLeadEvent;

class CpLeadService
{
    public function __construct(private LeadService $leads) {}

    public function logEvent(CpLead $lead, ?string $old, string $new, string $actorType, ?int $actorId, ?string $note = null): void
    {
        CpLeadEvent::create([
            'cp_lead_id' => $lead->id,
            'old_status' => $old,
            'new_status' => $new,
            'actor_type' => $actorType,
            'actor_id' => $actorId,
            'note' => $note,
        ]);
    }

    /** Admin bridge: accept a CP lead into the main CRM pipeline (dedup/routing/scoring apply). */
    public function acceptIntoCrm(CpLead $cpLead, int $adminId): CpLead
    {
        if ($cpLead->converted_lead_id) {
            abort(422, 'This lead has already been accepted into the CRM.');
        }
        $partner = $cpLead->partner;
        $result = $this->leads->capture([
            'name' => $cpLead->customer_name,
            'phone' => $cpLead->phone,
            'email' => $cpLead->email,
            'source' => $cpLead->source,
            'project_id' => $cpLead->project_id,
            'property_type' => $cpLead->plot_type,
            'intent_notes' => trim(($cpLead->notes ? $cpLead->notes . ' ' : '')
                . 'Via ' . ($partner?->name ?? 'Channel Partner') . ' (' . ($partner?->cp_code ?? '') . ')'),
            'channel_partner_id' => $partner?->id,
        ], true);

        $lead = $result['lead'] ?? null;
        if ($lead && $partner) {
            $lead->forceFill(['channel_partner_id' => $partner->id])->save();
        }
        $cpLead->forceFill([
            'status' => 'converted',
            'converted_lead_id' => $lead?->id,
        ])->save();
        $this->logEvent($cpLead, 'new', 'converted', 'admin', $adminId, 'Accepted into CRM pipeline');
        return $cpLead->fresh(['convertedLead', 'partner', 'representative']);
    }
}
