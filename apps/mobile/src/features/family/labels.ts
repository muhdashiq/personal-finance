import type { MemberRelationship } from '@family-finance/core';

export const RELATIONSHIP_LABELS: Record<MemberRelationship, string> = {
  self: 'Self',
  spouse: 'Spouse',
  partner: 'Partner',
  child: 'Child',
  parent: 'Parent',
  sibling: 'Sibling',
  other: 'Other',
};

export const ROLE_LABELS = { admin: 'Admin', member: 'Member', viewer: 'Viewer' } as const;
