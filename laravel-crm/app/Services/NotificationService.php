<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

class NotificationService
{
    /** Create a notification for one user. */
    public function notify(?int $userId, string $type, string $title, string $body = '', ?string $link = null, array $data = []): void
    {
        if (! $userId) {
            return;
        }
        Notification::create([
            'user_id' => $userId,
            'type' => $type,
            'title' => $title,
            'body' => $body ?: null,
            'link' => $link,
            'data' => $data ?: null,
        ]);
    }

    /** Notify every active user whose role holds a given permission (plus Super Admins). */
    public function notifyPermission(string $permKey, string $type, string $title, string $body = '', ?string $link = null, array $data = []): void
    {
        $roleIds = Role::whereHas('permissions', fn ($q) => $q->where('key', $permKey))
            ->orWhere('slug', 'admin')
            ->pluck('id');
        $userIds = User::whereIn('role_id', $roleIds)->where('is_active', true)->pluck('id');
        foreach ($userIds as $uid) {
            $this->notify($uid, $type, $title, $body, $link, $data);
        }
    }
}
