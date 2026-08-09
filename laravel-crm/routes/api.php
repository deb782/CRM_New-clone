<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\CommunicationController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\CostSheetController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DealBookingController;
use App\Http\Controllers\Api\DiscountController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\PaymentPlanController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ScoringController;
use App\Http\Controllers\Api\SequenceController;
use App\Http\Controllers\Api\SiteVisitController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // --- Public ---
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:20,1');
    Route::middleware('throttle:60,1')->group(function () {
        Route::post('webhooks/lead-form', [WebhookController::class, 'leadForm']);
        Route::post('webhooks/whatsapp', [WebhookController::class, 'whatsapp']);
        Route::post('webhooks/telephony', [WebhookController::class, 'telephony']);
        Route::post('webhooks/razorpay', [WebhookController::class, 'razorpay']);
        Route::post('chatbot', [WebhookController::class, 'chatbot']);
        Route::get('track/email/{event}/{emailId}', [WebhookController::class, 'emailEvent']);
    });
    // Public booking form (token link)
    Route::middleware('throttle:60,1')->group(function () {
        Route::get('booking-form/{token}', [DealBookingController::class, 'publicShow']);
        Route::post('booking-form/{token}', [DealBookingController::class, 'publicSubmit']);
    });

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

        // Inventory: Projects -> Phases -> Plots
        Route::get('inventory/tree', [InventoryController::class, 'tree']);
        Route::get('inventory/available-plots', [InventoryController::class, 'availablePlots']);
        Route::post('phases', [InventoryController::class, 'storePhase'])->middleware('permission:projects.manage');
        Route::put('phases/{phase}', [InventoryController::class, 'updatePhase'])->middleware('permission:projects.manage');
        Route::post('plots', [InventoryController::class, 'storePlot'])->middleware('permission:projects.manage');
        Route::put('plots/{plot}', [InventoryController::class, 'updatePlot'])->middleware('permission:projects.manage');
        Route::delete('plots/{plot}', [InventoryController::class, 'destroyPlot'])->middleware('permission:projects.manage');

        // Site Visits (Sections I & J)
        Route::get('site-visits', [SiteVisitController::class, 'index']);
        Route::get('site-visits/slots', [SiteVisitController::class, 'slots']);
        Route::post('leads/{lead}/site-visits', [SiteVisitController::class, 'store'])->middleware('permission:leads.edit');
        Route::get('site-visits/{siteVisit}', [SiteVisitController::class, 'show']);
        Route::post('site-visits/{siteVisit}/confirm', [SiteVisitController::class, 'confirm']);
        Route::post('site-visits/{siteVisit}/reschedule', [SiteVisitController::class, 'reschedule']);
        Route::post('site-visits/{siteVisit}/checkin', [SiteVisitController::class, 'checkin']);
        Route::post('site-visits/{siteVisit}/checkout', [SiteVisitController::class, 'checkout']);
        Route::post('site-visits/{siteVisit}/complete', [SiteVisitController::class, 'complete']);
        Route::post('site-visits/{siteVisit}/cancel', [SiteVisitController::class, 'cancel']);

        // Cost sheets, discounts & proposals (Section L)
        Route::get('leads/{lead}/cost-sheets', [CostSheetController::class, 'index']);
        Route::post('leads/{lead}/cost-sheets', [CostSheetController::class, 'store'])->middleware('permission:leads.edit');
        Route::get('cost-sheets/{costSheet}', [CostSheetController::class, 'show']);
        Route::post('cost-sheets/{costSheet}/select-plan', [CostSheetController::class, 'selectPlan']);
        Route::post('cost-sheets/{costSheet}/share', [CostSheetController::class, 'share']);
        Route::post('cost-sheets/{costSheet}/proposal', [CostSheetController::class, 'generateProposal']);
        Route::post('proposals/{proposal}/send', [CostSheetController::class, 'sendProposal']);
        Route::post('proposals/{proposal}/consent', [CostSheetController::class, 'consent']);

        Route::get('payment-plans', [PaymentPlanController::class, 'index']);
        Route::post('payment-plans', [PaymentPlanController::class, 'store'])->middleware('permission:config.manage');
        Route::put('payment-plans/{paymentPlan}', [PaymentPlanController::class, 'update'])->middleware('permission:config.manage');
        Route::delete('payment-plans/{paymentPlan}', [PaymentPlanController::class, 'destroy'])->middleware('permission:config.manage');

        Route::get('discount-approvals', [DiscountController::class, 'index']);
        Route::post('discount-approvals/{approval}/decide', [DiscountController::class, 'decide'])->middleware('permission:discounts.approve');

        // Deal closure & booking (Section M)
        Route::post('leads/{lead}/won', [DealBookingController::class, 'markWon'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/lost', [DealBookingController::class, 'markLost'])->middleware('permission:leads.edit');
        Route::get('bookings', [DealBookingController::class, 'index']);
        Route::get('bookings/{booking}', [DealBookingController::class, 'show']);
        Route::post('bookings/{booking}/verify', [DealBookingController::class, 'verify']);
        Route::post('bookings/{booking}/pay-token', [DealBookingController::class, 'payToken']);

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
