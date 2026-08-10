<?php

use App\Http\Controllers\Api\AgreementController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AutomationController;
use App\Http\Controllers\Api\ChannelPartnerController;
use App\Http\Controllers\Api\CommunicationController;
use App\Http\Controllers\Api\ContactController;
use App\Http\Controllers\Api\CostSheetController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DealBookingController;
use App\Http\Controllers\Api\DemandLetterController;
use App\Http\Controllers\Api\DiscountController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentPlanController;
use App\Http\Controllers\Api\PaymentScheduleController;
use App\Http\Controllers\Api\PostSalesController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ScoringController;
use App\Http\Controllers\Api\SequenceController;
use App\Http\Controllers\Api\SiteVisitController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TemplateController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\WhatsAppAutoReplyController;
use App\Http\Controllers\Api\WhatsAppBroadcastController;
use App\Http\Controllers\Api\WhatsAppInboxController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // --- Public ---
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:60,1');
    Route::middleware('throttle:60,1')->group(function () {
        Route::post('webhooks/lead-form', [WebhookController::class, 'leadForm']);
        Route::get('webhooks/whatsapp', [WebhookController::class, 'whatsappVerify']);
        Route::post('webhooks/whatsapp', [WebhookController::class, 'whatsapp']);
        Route::get('webhooks/meta-leads', [WebhookController::class, 'metaLeadsVerify']);
        Route::post('webhooks/meta-leads', [WebhookController::class, 'metaLeads']);
        Route::post('webhooks/telephony', [WebhookController::class, 'telephony']);
        Route::post('webhooks/razorpay', [WebhookController::class, 'razorpay']);
        Route::post('chatbot', [WebhookController::class, 'chatbot']);
        Route::get('track/email/{event}/{emailId}', [WebhookController::class, 'emailEvent']);
        Route::post('public/refer/{code}', [\App\Http\Controllers\Api\ChannelPartnerController::class, 'refer']);
        Route::get('public/widget-config/{code}', [\App\Http\Controllers\Api\ChannelPartnerController::class, 'widgetConfig']);
        // Email open/click tracking (public, no auth)
        Route::get('email/open/{token}', [\App\Http\Controllers\Api\EmailTrackingController::class, 'open']);
        Route::get('email/click/{token}', [\App\Http\Controllers\Api\EmailTrackingController::class, 'click']);
        Route::get('email/unsubscribe/{token}', [\App\Http\Controllers\Api\EmailTrackingController::class, 'unsubscribe']);
    });
    // Public booking form (token link)
    Route::middleware('throttle:60,1')->group(function () {
        Route::get('booking-form/{token}', [DealBookingController::class, 'publicShow']);
        Route::post('booking-form/{token}', [DealBookingController::class, 'publicSubmit']);
    });

    // --- Authenticated ---
    Route::middleware('auth:sanctum')->group(function () {
        // Always allowed (even when a password change is pending)
        Route::get('me', [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/change-password', [AuthController::class, 'changePassword']);
        Route::put('auth/profile', [AuthController::class, 'updateProfile']);
        Route::post('auth/impersonate', [AuthController::class, 'impersonate']);

        // Everything below requires the forced first-login password change to be done
        Route::middleware('force_pw')->group(function () {

        Route::get('dashboard', [DashboardController::class, 'stats']);
        // Onboarding wizard state
        Route::get('onboarding', [\App\Http\Controllers\Api\OnboardingController::class, 'show']);
        Route::put('onboarding', [\App\Http\Controllers\Api\OnboardingController::class, 'update'])->middleware('permission:config.manage');
        Route::post('onboarding/reset', [\App\Http\Controllers\Api\OnboardingController::class, 'reset'])->middleware('permission:config.manage');

        // Workflow builder (Process Admin USP)
        Route::middleware('permission:workflow.manage')->group(function () {
            Route::get('workflows', [\App\Http\Controllers\Api\WorkflowController::class, 'index']);
            Route::post('workflows', [\App\Http\Controllers\Api\WorkflowController::class, 'store']);
            Route::get('workflows/{workflow}', [\App\Http\Controllers\Api\WorkflowController::class, 'show']);
            Route::put('workflows/{workflow}', [\App\Http\Controllers\Api\WorkflowController::class, 'update']);
            Route::post('workflows/{workflow}/activate', [\App\Http\Controllers\Api\WorkflowController::class, 'activate']);
            Route::post('workflows/{workflow}/simulate', [\App\Http\Controllers\Api\WorkflowController::class, 'simulate']);
            Route::get('workflows/{workflow}/runs', [\App\Http\Controllers\Api\WorkflowController::class, 'runs']);
            Route::get('workflows/{workflow}/checklist', [\App\Http\Controllers\Api\WorkflowController::class, 'checklist']);
            Route::delete('workflows/{workflow}', [\App\Http\Controllers\Api\WorkflowController::class, 'destroy']);
        });

        // Leads
        Route::get('leads', [LeadController::class, 'index'])->middleware('permission:leads.view');
        Route::get('leads/board', [LeadController::class, 'board'])->middleware('permission:leads.view');
        Route::get('leads/call-list', [LeadController::class, 'callList'])->middleware('permission:leads.view');
        Route::get('leads/check-duplicate', [LeadController::class, 'checkDuplicate'])->middleware('permission:leads.view');
        Route::post('leads', [LeadController::class, 'store'])->middleware('permission:leads.create');
        Route::get('leads/{lead}', [LeadController::class, 'show'])->middleware('permission:leads.view');
        Route::get('leads/{lead}/journey', [\App\Http\Controllers\Api\WorkflowController::class, 'leadJourney'])->middleware('permission:leads.view');
        Route::put('leads/{lead}', [LeadController::class, 'update'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/qualify', [LeadController::class, 'qualify'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/transition', [LeadController::class, 'transition'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/verify', [LeadController::class, 'verify'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/recalculate', [LeadController::class, 'recalculate'])->middleware('permission:leads.view');
        Route::post('leads/{lead}/merge', [LeadController::class, 'merge'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/dnc', [LeadController::class, 'markDnc'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/invalid', [LeadController::class, 'markInvalid'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/consent', [LeadController::class, 'consent'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/stakeholders', [LeadController::class, 'addStakeholder'])->middleware('permission:leads.edit');
        Route::delete('leads/{lead}/stakeholders/{index}', [LeadController::class, 'removeStakeholder'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/interested-units', [LeadController::class, 'setInterestedUnits'])->middleware('permission:leads.edit');
        Route::post('leads/{lead}/switch-project', [LeadController::class, 'switchProject'])->middleware('permission:leads.edit');
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
        Route::get('tasks/sla-board', [TaskController::class, 'slaBoard'])->middleware('permission:leads.view');
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
        Route::post('bookings/{booking}/cancel', [DealBookingController::class, 'cancel'])->middleware('permission:postsales.manage');

        // Post-sales: payments, receipts, reconciliation, documents & letters (Section N)
        Route::get('payments', [PaymentController::class, 'index']);
        Route::get('payments/reconciliation', [PaymentController::class, 'reconciliation']);
        Route::post('bookings/{booking}/payments', [PaymentController::class, 'store'])->middleware('permission:postsales.manage');
        Route::post('payments/{payment}/verify', [PaymentController::class, 'verify'])->middleware('permission:postsales.manage');
        Route::post('payments/{payment}/reconcile', [PaymentController::class, 'reconcile'])->middleware('permission:postsales.manage');
        Route::post('payments/{payment}/fail', [PaymentController::class, 'markFailed'])->middleware('permission:postsales.manage');

        Route::get('bookings/{booking}/post-sales', [PostSalesController::class, 'show']);
        Route::post('bookings/{booking}/checklist', [PostSalesController::class, 'seedChecklist'])->middleware('permission:postsales.manage');
        Route::post('bookings/{booking}/welcome-letter', [PostSalesController::class, 'welcome'])->middleware('permission:postsales.manage');
        Route::put('documents/{item}', [PostSalesController::class, 'updateDoc'])->middleware('permission:postsales.manage');

        // Payment schedule & collections (Section P)
        Route::get('collections', [PaymentScheduleController::class, 'collections']);
        Route::get('bookings/{booking}/milestones', [PaymentScheduleController::class, 'index']);
        Route::post('bookings/{booking}/milestones/generate', [PaymentScheduleController::class, 'generate'])->middleware('permission:postsales.manage');
        Route::post('milestones/{milestone}/pay', [PaymentScheduleController::class, 'pay'])->middleware('permission:postsales.manage');

        // Allotment & Agreement for Sale + mock e-sign (Section O)
        Route::get('bookings/{booking}/agreements', [AgreementController::class, 'index']);
        Route::post('bookings/{booking}/agreements', [AgreementController::class, 'generate'])->middleware('permission:postsales.manage');
        Route::post('agreements/{agreement}/send-for-sign', [AgreementController::class, 'sendForSign'])->middleware('permission:postsales.manage');
        Route::post('agreements/{agreement}/sign', [AgreementController::class, 'sign'])->middleware('permission:postsales.manage');
        Route::post('agreements/{agreement}/upload-signed', [AgreementController::class, 'uploadSigned'])->middleware('permission:postsales.manage');
        Route::post('agreements/{agreement}/register', [AgreementController::class, 'register'])->middleware('permission:postsales.manage');

        // Demand letters + escalation (Section Q)
        Route::get('demand-letters', [DemandLetterController::class, 'index']);
        Route::post('milestones/{milestone}/demand-letter', [DemandLetterController::class, 'generate'])->middleware('permission:postsales.manage');
        Route::post('demand-letters/{demandLetter}/deliver', [DemandLetterController::class, 'deliver'])->middleware('permission:postsales.manage');
        Route::post('demand-letters/{demandLetter}/escalate', [DemandLetterController::class, 'escalate'])->middleware('permission:postsales.manage');

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

        // Audit trail, system/integration health & performance (Section T)
        Route::get('audit-logs', [AuditController::class, 'index'])->middleware('permission:config.manage');
        Route::get('system/health', [AuditController::class, 'health'])->middleware('permission:config.manage');
        Route::get('system/performance', [AuditController::class, 'performance'])->middleware('permission:config.manage');

        // Channel partners + commissions (admin) & partner portal (Section: Channel Partner)
        Route::get('partner/portal', [ChannelPartnerController::class, 'portal'])->middleware('permission:partner.portal');
        Route::put('partner/branding', [ChannelPartnerController::class, 'updateBranding'])->middleware('permission:partner.portal');

        // --- WhatsApp Business: team inbox (Meta Cloud API, mock-ready) ---
        Route::middleware('permission:leads.view')->group(function () {
            Route::get('whatsapp/conversations', [WhatsAppInboxController::class, 'conversations']);
            Route::get('whatsapp/conversations/{conversation}/messages', [WhatsAppInboxController::class, 'messages']);
            Route::post('whatsapp/conversations/{conversation}/reply', [WhatsAppInboxController::class, 'reply']);
            Route::post('whatsapp/media/upload', [WhatsAppInboxController::class, 'uploadMedia']);
            Route::get('whatsapp/analytics', [WhatsAppInboxController::class, 'analytics']);
            Route::get('whatsapp/templates', [\App\Http\Controllers\Api\WhatsAppTemplateController::class, 'index']);
            Route::get('whatsapp/canned-replies', [\App\Http\Controllers\Api\WhatsAppCannedReplyController::class, 'index']);
            Route::post('whatsapp/canned-replies', [\App\Http\Controllers\Api\WhatsAppCannedReplyController::class, 'store']);
            Route::put('whatsapp/canned-replies/{canned_reply}', [\App\Http\Controllers\Api\WhatsAppCannedReplyController::class, 'update']);
            Route::delete('whatsapp/canned-replies/{canned_reply}', [\App\Http\Controllers\Api\WhatsAppCannedReplyController::class, 'destroy']);
            Route::get('whatsapp/settings', [WhatsAppInboxController::class, 'settings']);
            Route::post('whatsapp/conversations/{conversation}/assign', [WhatsAppInboxController::class, 'assign']);
            Route::post('whatsapp/conversations/{conversation}/read', [WhatsAppInboxController::class, 'read']);
            Route::post('whatsapp/conversations/{conversation}/toggle', [WhatsAppInboxController::class, 'toggle']);
            Route::get('whatsapp/conversations/{conversation}/notes', [WhatsAppInboxController::class, 'notes']);
            Route::post('whatsapp/conversations/{conversation}/notes', [WhatsAppInboxController::class, 'addNote']);
            Route::delete('whatsapp/conversations/{conversation}/notes/{note}', [WhatsAppInboxController::class, 'deleteNote']);
            Route::put('whatsapp/conversations/{conversation}/tags', [WhatsAppInboxController::class, 'updateTags']);
            Route::post('whatsapp/simulate-inbound', [WhatsAppInboxController::class, 'simulateInbound']);
        });
        // Broadcasts + auto-replies (manager/config)
        Route::middleware('permission:config.manage')->group(function () {
            Route::get('whatsapp/broadcasts', [WhatsAppBroadcastController::class, 'index']);
            Route::post('whatsapp/broadcasts', [WhatsAppBroadcastController::class, 'store']);
            Route::post('whatsapp/broadcasts/{broadcast}/send', [WhatsAppBroadcastController::class, 'send']);
            Route::get('whatsapp/auto-replies', [WhatsAppAutoReplyController::class, 'index']);
            Route::post('whatsapp/auto-replies', [WhatsAppAutoReplyController::class, 'store']);
            Route::put('whatsapp/auto-replies/{auto_reply}', [WhatsAppAutoReplyController::class, 'update']);
            Route::delete('whatsapp/auto-replies/{auto_reply}', [WhatsAppAutoReplyController::class, 'destroy']);
            Route::post('whatsapp/templates/sync', [\App\Http\Controllers\Api\WhatsAppTemplateController::class, 'sync']);
            Route::put('whatsapp/settings', [WhatsAppInboxController::class, 'updateSettings']);

            // --- Email broadcast module (templates + campaigns) ---
            Route::get('email/templates/starters', [\App\Http\Controllers\Api\EmailTemplateController::class, 'starters']);
            Route::get('email/templates', [\App\Http\Controllers\Api\EmailTemplateController::class, 'index']);
            Route::get('email/templates/{email_template}', [\App\Http\Controllers\Api\EmailTemplateController::class, 'show']);
            Route::post('email/templates', [\App\Http\Controllers\Api\EmailTemplateController::class, 'store']);
            Route::put('email/templates/{email_template}', [\App\Http\Controllers\Api\EmailTemplateController::class, 'update']);
            Route::delete('email/templates/{email_template}', [\App\Http\Controllers\Api\EmailTemplateController::class, 'destroy']);
            Route::get('email/campaigns', [\App\Http\Controllers\Api\EmailCampaignController::class, 'index']);
            Route::get('email/campaigns/{email_campaign}', [\App\Http\Controllers\Api\EmailCampaignController::class, 'show']);
            Route::get('email/campaigns/{email_campaign}/analytics', [\App\Http\Controllers\Api\EmailCampaignController::class, 'analytics']);
            Route::post('email/campaigns', [\App\Http\Controllers\Api\EmailCampaignController::class, 'store']);
            Route::put('email/campaigns/{email_campaign}', [\App\Http\Controllers\Api\EmailCampaignController::class, 'update']);
            Route::delete('email/campaigns/{email_campaign}', [\App\Http\Controllers\Api\EmailCampaignController::class, 'destroy']);
            Route::post('email/campaigns/{email_campaign}/send', [\App\Http\Controllers\Api\EmailCampaignController::class, 'send']);
            Route::post('email/campaigns/{email_campaign}/schedule', [\App\Http\Controllers\Api\EmailCampaignController::class, 'schedule']);
            Route::post('email/campaigns/{email_campaign}/unschedule', [\App\Http\Controllers\Api\EmailCampaignController::class, 'unschedule']);
        });
        Route::get('partners', [ChannelPartnerController::class, 'index'])->middleware('permission:config.manage');
        Route::post('partners', [ChannelPartnerController::class, 'store'])->middleware('permission:config.manage');
        Route::put('partners/{channelPartner}', [ChannelPartnerController::class, 'update'])->middleware('permission:config.manage');
        Route::get('commissions', [ChannelPartnerController::class, 'commissions'])->middleware('permission:config.manage');
        Route::post('bookings/{booking}/commission', [ChannelPartnerController::class, 'decideCommission'])->middleware('permission:config.manage');

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
        Route::get('permissions', [UserController::class, 'permissions'])->middleware('permission:users.manage');
        Route::put('roles/{role}/permissions', [UserController::class, 'updateRolePermissions'])->middleware('permission:users.manage');
        Route::post('roles/{role}/reset-permissions', [UserController::class, 'resetPermissions'])->middleware('permission:users.manage');

        Route::middleware('permission:integrations.manage')->group(function () {
            Route::get('integrations', [\App\Http\Controllers\Api\IntegrationController::class, 'index']);
            Route::put('integrations/{key}', [\App\Http\Controllers\Api\IntegrationController::class, 'update']);
            Route::post('integrations/{key}/test', [\App\Http\Controllers\Api\IntegrationController::class, 'test']);
            Route::post('integrations/{key}/toggle', [\App\Http\Controllers\Api\IntegrationController::class, 'toggle']);
            Route::post('integrations/meta_lead_ads/oauth', [\App\Http\Controllers\Api\IntegrationController::class, 'metaOauth']);
        });

        // Notifications (per-user)
        Route::get('notifications', [\App\Http\Controllers\Api\NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [\App\Http\Controllers\Api\NotificationController::class, 'unreadCount']);
        Route::post('notifications/{notification}/read', [\App\Http\Controllers\Api\NotificationController::class, 'markRead']);
        Route::post('notifications/read-all', [\App\Http\Controllers\Api\NotificationController::class, 'markAll']);

        // Reports & analytics (Admins + department Heads)
        Route::get('reports/sales', [\App\Http\Controllers\Api\ReportController::class, 'sales'])->middleware('permission:reports.sales');
        Route::get('reports/financial', [\App\Http\Controllers\Api\ReportController::class, 'financial'])->middleware('permission:reports.financial');
        Route::get('reports/activity', [\App\Http\Controllers\Api\ReportController::class, 'activity'])->middleware('permission:reports.activity');

        // Payment receipt (branded PDF acknowledgement)
        Route::get('payments/{payment}/receipt', [PaymentController::class, 'receipt']);
        }); // end force_pw group
    });
});
