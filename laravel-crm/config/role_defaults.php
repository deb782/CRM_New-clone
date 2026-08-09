<?php

// Default (out-of-the-box KRA) permissions per role slug. Mirrors the seeder.
// Used by the Roles & Access screen for "reset to default" and deviation badges.
return [
    'process_admin' => ['config.manage', 'users.manage', 'projects.manage', 'workflow.manage', 'integrations.manage', 'leads.view'],
    'sales_head' => ['leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.override', 'discounts.approve', 'projects.manage'],
    'sales_bdm' => ['leads.view', 'leads.create', 'leads.edit'],
    'sales_bde' => ['leads.view', 'leads.create', 'leads.edit'],
    'accounts_head' => ['accounts.view', 'accounts.manage', 'postsales.manage', 'leads.view'],
    'accounts_support' => ['accounts.view', 'leads.view'],
    'legal_head' => ['legal.view', 'legal.manage', 'leads.view'],
    'legal_support' => ['legal.view', 'leads.view'],
    'crm_head' => ['crm.view', 'crm.manage', 'postsales.manage', 'leads.view', 'leads.edit'],
    'crm_support' => ['crm.view', 'leads.view'],
    'channel_partner' => ['partner.portal'],
];
