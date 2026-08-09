<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OnboardingState;
use App\Models\Project;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;

class OnboardingController extends Controller
{
    /** The onboarding checklist steps in order. */
    private array $stepKeys = ['profile', 'projects', 'users', 'inventory', 'process_admin'];

    public function show()
    {
        $state = OnboardingState::current();
        $steps = $state->steps ?: [];

        // Derive live signals so the timeline reflects real data
        $hasProcessAdmin = User::whereHas('role', fn ($q) => $q->where('slug', 'process_admin'))->where('is_active', true)->exists();
        $projectCount = Project::count();
        $deptUserCount = User::whereHas('role', fn ($q) => $q->whereNotIn('slug', ['admin', 'channel_partner']))->count();

        $derived = [
            'profile' => (bool) ($steps['profile'] ?? false),
            'projects' => $projectCount > 0 || (bool) ($steps['projects'] ?? false),
            'users' => $deptUserCount > 0 || (bool) ($steps['users'] ?? false),
            'inventory' => \App\Models\Plot::count() > 0 || (bool) ($steps['inventory'] ?? false),
            'process_admin' => $hasProcessAdmin,
        ];

        $done = count(array_filter($derived));
        $total = count($this->stepKeys);

        return response()->json([
            'setup_choice' => $state->setup_choice,
            'completed' => $state->completed,
            'steps' => $derived,
            'progress' => ['done' => $done, 'total' => $total, 'pct' => (int) round($done / $total * 100)],
            'signals' => ['projects' => $projectCount, 'dept_users' => $deptUserCount, 'has_process_admin' => $hasProcessAdmin],
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'setup_choice' => 'nullable|in:now,later',
            'step' => 'nullable|in:profile,projects,users,inventory,process_admin',
            'value' => 'nullable|boolean',
            'completed' => 'nullable|boolean',
        ]);

        $state = OnboardingState::current();
        $steps = $state->steps ?: [];

        if (array_key_exists('step', $data) && $data['step']) {
            $steps[$data['step']] = $data['value'] ?? true;
        }
        $state->fill([
            'setup_choice' => $data['setup_choice'] ?? $state->setup_choice,
            'steps' => $steps,
        ]);
        if (! empty($data['completed'])) {
            $state->completed = true;
            $state->completed_at = now();
        }
        $state->save();

        return $this->show();
    }
}
