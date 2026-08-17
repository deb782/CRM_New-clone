<?php

// Default (out-of-the-box KRA) permissions per role slug. Mirrors the seeder.
// Used by the Roles & Access screen for "reset to default" and deviation badges.
return [
    'process_admin' => ['config.manage', 'users.manage', 'projects.manage', 'workflow.manage', 'integrations.manage', 'leads.view', 'reports.sales', 'reports.financial', 'reports.activity'],
    'sales_head' => ['leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.override', 'discounts.approve', 'projects.manage', 'reports.sales', 'reports.activity'],
    'sales_bdm' => ['leads.view', 'leads.create', 'leads.edit'],
    'sales_bde' => ['leads.view', 'leads.create', 'leads.edit'],
    'accounts_head' => ['accounts.view', 'accounts.manage', 'postsales.manage', 'leads.view', 'reports.financial', 'reports.activity', 'finance.overview', 'expenses.view', 'expenses.approve', 'stock.view'],
    'accounts_support' => ['accounts.view', 'leads.view', 'expenses.view', 'expenses.approve'],
    'management' => ['finance.overview', 'expenses.view', 'expenses.approve_final', 'stock.view', 'reports.financial', 'reports.activity', 'leads.view', 'projects.manage'],
    'site_manager' => ['expenses.view', 'expenses.raise', 'stock.view', 'stock.manage'],
    'legal_head' => ['legal.view', 'legal.manage', 'leads.view', 'reports.activity'],
    'legal_support' => ['legal.view', 'leads.view'],
    'crm_head' => ['crm.view', 'crm.manage', 'postsales.manage', 'leads.view', 'leads.edit', 'reports.activity'],
    'crm_support' => ['crm.view', 'leads.view'],
    'channel_partner' => ['partner.portal'],
];
