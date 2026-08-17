<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Assignment-based project scoping.
 * A user with no project assignments is unrestricted (preserves legacy behaviour);
 * an assigned user is limited to their projects.
 */
class ProjectScope
{
    /** Project ids the user is scoped to, or null when unrestricted. */
    public static function ids(?User $user): ?array
    {
        if (! $user) {
            return null;
        }
        if ($user->role?->slug === 'admin') {
            return null;
        }
        $ids = $user->projects()->pluck('projects.id')->all();
        return count($ids) ? $ids : null;
    }

    /** Constrain a query to the user's assigned projects when applicable. */
    public static function apply(Builder $query, ?User $user, string $column = 'project_id'): Builder
    {
        $ids = self::ids($user);
        if ($ids !== null) {
            $query->whereIn($column, $ids);
        }
        return $query;
    }

    /** Can this user act on the given project id? */
    public static function allows(?User $user, ?int $projectId): bool
    {
        $ids = self::ids($user);
        if ($ids === null) {
            return true;
        }
        return $projectId !== null && in_array($projectId, $ids, true);
    }
}
