export function isLeadOwner(lead: { assignedToId: string | null }, userId: string, isAdmin: boolean) {
  return isAdmin || lead.assignedToId === userId;
}
