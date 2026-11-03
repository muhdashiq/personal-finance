/**
 * Query keys. Everything family-scoped lives under ['family', familyId] so a
 * family switch or sign-out can drop it in one call.
 */
export const qk = {
  families: (userId: string) => ['families', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  myInvitations: (userId: string) => ['invitations', 'mine', userId] as const,
  invitationPreview: (token: string) => ['invitations', 'preview', token] as const,
  family: (familyId: string) => ['family', familyId] as const,
  members: (familyId: string) => ['family', familyId, 'members'] as const,
  invitations: (familyId: string) => ['family', familyId, 'invitations'] as const,
  categories: (familyId: string) => ['family', familyId, 'categories'] as const,
  rules: (familyId: string) => ['family', familyId, 'rules'] as const,
  transactions: (familyId: string) => ['family', familyId, 'transactions'] as const,
  transactionList: (familyId: string, filters: unknown) => ['family', familyId, 'transactions', 'list', filters] as const,
  transaction: (familyId: string, id: string) => ['family', familyId, 'transactions', 'detail', id] as const,
  attachments: (familyId: string, transactionId: string) => ['family', familyId, 'transactions', 'attachments', transactionId] as const,
  accounts: (familyId: string) => ['family', familyId, 'accounts'] as const,
  balances: (familyId: string) => ['family', familyId, 'balances'] as const,
  reports: (familyId: string) => ['family', familyId, 'reports'] as const,
  report: (familyId: string, name: string, params: unknown) => ['family', familyId, 'reports', name, params] as const,
};
