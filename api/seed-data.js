/** Default master data. `npm run seed` upserts these; afterwards they are managed from Settings. */
module.exports = {
  roles: [
    { key: 'admin', name: 'Administrator', description: 'Full access to everything', permissions: ['*'], isSystem: true },
    { key: 'sales_manager', name: 'Sales Manager', description: 'Manages all leads and the sales team', isSystem: true,
      permissions: ['dashboard:view', 'leads:view_all', 'leads:create', 'leads:edit', 'leads:delete', 'leads:assign', 'leads:export', 'followups:manage'] },
    { key: 'sales_executive', name: 'Sales Executive', description: 'Works leads assigned to them', isSystem: true,
      permissions: ['dashboard:view', 'leads:create', 'leads:edit', 'followups:manage'] },
    { key: 'marketing_manager', name: 'Marketing Manager', description: 'Views all leads and analytics; exports data', isSystem: true,
      permissions: ['dashboard:view', 'leads:view_all', 'leads:export'] },
  ],
  // Stages. Hot / Warm / Cold are stages (no separate temperature).
  statuses: [
    { key: 'NEW', label: 'Open', color: '#7040F0', isSystem: true },
    { key: 'CONTACTED', label: 'Contacted', color: '#4A3878' },
    { key: 'RINGING', label: 'Ringing', color: '#2E86DE' },
    { key: 'COLD', label: 'Cold', color: '#3FA7D6', needsBudget: true },
    { key: 'WARM', label: 'Warm', color: '#E0A030', needsBudget: true },
    { key: 'HOT', label: 'Hot', color: '#E4572E', needsBudget: true },
    { key: 'PROPOSAL_SENT', label: 'Proposal Sent', color: '#B05CC8' },
    { key: 'BOOKED', label: 'Booked', color: '#2E9E6A', isBooked: true, isWon: true },
    { key: 'LOST', label: 'Lost', color: '#C0485A', requiresReason: true, isLost: true },
  ],
  services: [
    ['website-development', 'Website Development'], ['website-design', 'Website Design'], ['seo', 'SEO'],
    ['google-ads', 'Google Ads'], ['meta-ads', 'Meta Ads'], ['social-media-marketing', 'Social Media Marketing'],
    ['lead-generation', 'Lead Generation'], ['branding', 'Branding'], ['performance-marketing', 'Performance Marketing'],
    ['ecommerce-development', 'E-commerce Development'], ['marketing-automation', 'Marketing Automation'],
  ].map(([slug, label]) => ({ slug, label })),
  sources: [
    ['website', 'Website'], ['whatsapp', 'WhatsApp'], ['phone', 'Phone'], ['meta_ads', 'Meta Ads'], ['google_ads', 'Google Ads'],
    ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['referral', 'Referral'], ['direct', 'Direct'], ['import', 'Import'], ['other', 'Other'],
  ].map(([key, label]) => ({ key, label })),
  lostReasons: ['Budget too low', 'Not interested', 'Went with competitor', 'Project postponed', 'No response', 'Wrong enquiry', 'Other'].map((label) => ({ label })),
  followupTypes: [
    ['call', 'Call'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['meeting', 'Meeting'], ['proposal', 'Proposal'],
    ['payment', 'Payment follow-up'], ['task', 'Task / to-do'], ['other', 'Other'],
  ].map(([key, label]) => ({ key, label })),
};
