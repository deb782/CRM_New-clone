<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\CommunicationController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ScoringController;
use App\Http\Controllers\Api\SequenceController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // --- Public ---
    Route::post('auth/login', [AuthController::class, 'login']);
    Route::post('webhooks/lead-form', [WebhookController::class, 'leadForm']);
    Route::post('webhooks/whatsapp', [WebhookController::class, 'whatsapp']);
    Route::post('webhooks/telephony', [WebhookController::class, 'telephony']);
    Route::get('track/email/{event}/{emailId}', [WebhookController::class, 'emailEvent']);

    // --- Authenticated ---
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);

        Route::get('dashboard', [DashboardController::class, 'stats']);

        // Leads
        Route::get('leads', [LeadController::class, 'index']);
        Route::get('leads/board', [LeadController::class, 'board']);
        Route::get('leads/call-list', [LeadController::class, 'callList']);
        Route::get('leads/check-duplicate', [LeadController::class, 'checkDuplicate']);
        Route::post('leads', [LeadController::class, 'store'])->middleware('permission:leads.create');
        Route::get('leads/{lead}', [LeadController::class, 'show']);
        Route::put('leads/{lead}', [LeadController::class, 'update'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/qualify', [LeadController::class, 'qualify'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/transition', [LeadController::class, 'transition'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/verify', [LeadController::class, 'verify'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/recalculate', [LeadController::class, 'recalculate']);
        Route::post('leads/{lead}/merge', [LeadController::class, 'merge'])->middleware('permission:leads.edit');
        Route::delete('leads/{lead}', [LeadController::class, 'destroy'])->middleware('permission:leads.delete');

        // Communication + timeline
        Route::post('leads/{lead}/whatsapp', [CommunicationController::class, 'sendWhatsapp']);
        Route::post('leads/{lead}/email', [CommunicationController::class, 'sendEmail']);
        Route::post('leads/{lead}/call', [CommunicationController::class, 'clickToCall']);
        Route::post('leads/{lead}/call-log', [CommunicationController::class, 'logCall']);
        Route::post('leads/{lead}/note', [CommunicationController::class, 'addNote']);
        Route::post('leads/{lead}/enroll', [SequenceController::class, 'enroll']);
        Route::post('leads/{lead}/pause-sequence', [SequenceController::class, 'pause']);

        // Tasks
        Route::get('tasks', [TaskController::class, 'index']);
        Route::post('tasks', [TaskController::class, 'store']);
        Route::post('tasks/{task}/complete', [TaskController::class, 'complete']);
        Route::put('tasks/{task}', [TaskController::class, 'update']);

        // Import
        Route::post('leads-import/preview', [ImportController::class, 'preview']);
        Route::post('leads-import/commit', [ImportController::class, 'commit']);
        Route::get('leads-import/history', [ImportController::class, 'history']);

        // Contacts / Projects
        Route::get('contacts', [ContactController::class, 'index']);
        Route::post('contacts', [ContactController::class, 'store']);
        Route::get('contacts/{contact}', [ContactController::class, 'show']);
        Route::get('projects', [ProjectController::class, 'index']);
        Route::post('projects', [ProjectController::class, 'store'])->middleware('permission:projects.manage');
        Route::get('projects/{project}', [ProjectController::class, 'show']);
        Route::put('projects/{project}', [ProjectController::class, 'update'])->middleware('permission:projects.manage');

        // Config (admin)
        Route::get('scoring-rules', [ScoringController::class, 'index']);
        Route::post('scoring-rules', [ScoringController::class, 'store'])->middleware('permission:config.manage');
        Route::put('scoring-rules/{rule}', [ScoringController::class, 'update'])->middleware('permission:config.manage');
        Route::delete('scoring-rules/{rule}', [ScoringController::class, 'destroy'])->middleware('permission:config.manage');
        Route::post('scoring-rules/recalculate-all', [ScoringController::class, 'recalculateAll'])->middleware('permission:config.manage');

        Route::get('automation-rules', [AutomationController::class, 'index']);
        Route::post('automation-rules', [AutomationController::class, 'store'])->middleware('permission:config.manage');
        Route::put('automation-rules/{rule}', [AutomationController::class, 'update'])->middleware('permission:config.manage');
        Route::delete('automation-rules/{rule}', [AutomationController::class, 'destroy'])->middleware('permission:config.manage');
        Route::get('automation-logs', [AutomationController::class, 'logs']);

        Route::get('sequences', [SequenceController::class, 'index']);
        Route::get('templates', [TemplateController::class, 'index']);
        Route::post('templates', [TemplateController::class, 'store'])->middleware('permission:config.manage');
        Route::put('templates/{template}', [TemplateController::class, 'update'])->middleware('permission:config.manage');
        Route::delete('templates/{template}', [TemplateController::class, 'destroy'])->middleware('permission:config.manage');

        // Users / roles (admin)
        Route::get('users', [UserController::class, 'index'])->middleware('permission:users.manage');
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.manage');
        Route::put('users/{user}', [UserController::class, 'update'])->middleware('permission:users.manage');
        Route::get('roles', [UserController::class, 'roles']);
    });
});
