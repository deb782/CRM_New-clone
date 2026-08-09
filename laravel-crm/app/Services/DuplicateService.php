<?php

namespace App\Services;

use App\Models\Activity;
use App\Models\AuditLog;
use App\Models\Call;
use App\Models\Email;
use App\Models\Lead;
use App\Models\LeadMerge;
use App\Models\Task;
use App\Models\WhatsappMessage;
use Illuminate\Support\Facades\Auth;

class DuplicateService
{
    /**
     * Detect duplicates (B1.1). Returns ['block'=>bool, 'reason'=>?, 'matches'=>Collection].
     */
    public function detect(?string $email, ?string $phone, ?string $name = null, ?int $ignoreId = null): array
    {
        $matches = collect();
        $block = false;
        $reason = null;

        if ($email) {
            $exact = Lead::where('email', $email)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->get();
            if ($exact->isNotEmpty()) {
                $block = true;
                $reason = 'exact_email';
                $matches = $matches->merge($exact);
            }
        }
        if ($phone) {
            $exact = Lead::where('phone', $phone)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->get();
            if ($exact->isNotEmpty()) {
                $block = true;
                $reason = $reason ?: 'exact_phone';
                $matches = $matches->merge($exact);
            }
        }
        // Fuzzy: similar name + email domain -> flag only
        if (! $block && $name && $email) {
            $domain = substr(strrchr($email, '@') ?: '', 1);
            if ($domain) {
                $fuzzy = Lead::where('email', 'like', '%@'.$domain)
                    ->where('name', 'like', '%'.explode(' ', trim($name))[0].'%')
                    ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
                    ->get();
                if ($fuzzy->isNotEmpty()) {
                    $reason = 'fuzzy_name_email';
                    $matches = $matches->merge($fuzzy);
                }
            }
        }

        return [
            'block' => $block,
            'flag' => ! $block && $matches->isNotEmpty(),
            'reason' => $reason,
            'matches' => $matches->unique('id')->values(),
        ];
    }

    /** Merge duplicate lead into master (B1.2). */
    public function merge(Lead $master, Lead $dup, ?string $reason = null): Lead
    {
        $snapshot = $dup->toArray();

        // Move all related records to master
        Activity::where('subject_type', Lead::class)->where('subject_id', $dup->id)
            ->update(['subject_id' => $master->id]);
        Call::where('lead_id', $dup->id)->update(['lead_id' => $master->id]);
        WhatsappMessage::where('lead_id', $dup->id)->update(['lead_id' => $master->id]);
        Email::where('lead_id', $dup->id)->update(['lead_id' => $master->id]);
        Task::where('lead_id', $dup->id)->update(['lead_id' => $master->id]);

        // Keep latest non-empty info on master; store older in meta
        $meta = $master->meta ?? [];
        $meta['merged_from'][] = ['id' => $dup->id, 'name' => $dup->name, 'email' => $dup->email, 'phone' => $dup->phone];
        $master->meta = $meta;
        $master->save();

        LeadMerge::create([
            'master_lead_id' => $master->id,
            'merged_lead_id' => $dup->id,
            'user_id' => Auth::id(),
            'snapshot' => $snapshot,
        ]);

        AuditLog::create([
            'auditable_type' => Lead::class,
            'auditable_id' => $master->id,
            'user_id' => Auth::id(),
            'action' => 'merged',
            'old_value' => 'lead#'.$dup->id,
            'new_value' => 'lead#'.$master->id,
            'reason' => $reason ?: 'duplicate merge',
        ]);

        $dup->delete();

        return $master->fresh();
    }

    /** Periodic scan report (B1.3). */
    public function scan(): array
    {
        $dupEmails = Lead::selectRaw('email, COUNT(*) as c')
            ->whereNotNull('email')->groupBy('email')->havingRaw('COUNT(*) > 1')->pluck('c', 'email');
        $dupPhones = Lead::selectRaw('phone, COUNT(*) as c')
            ->whereNotNull('phone')->groupBy('phone')->havingRaw('COUNT(*) > 1')->pluck('c', 'phone');

        return [
            'duplicate_emails' => $dupEmails,
            'duplicate_phones' => $dupPhones,
        ];
    }
}
