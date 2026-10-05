export enum AuthorizationDecision {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

export type AuthorizeInput = {
  userId: string;
  tenantId?: string | null;
  permission: string;
  resource?: {
    type: string;
    id?: string;
    tenantId?: string;
  };
};
