export enum ApplicationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

export enum EnvironmentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

export enum MetadataVisibility {
  TENANT_VISIBLE = 'TENANT_VISIBLE',
  ROLE_RESTRICTED = 'ROLE_RESTRICTED',
  OWNER_ONLY = 'OWNER_ONLY',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
}

export enum ApplicationMemberRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
}

export const DEFAULT_ENVIRONMENT_NAMES = ['DEV', 'TEST', 'STAGE', 'PROD'] as const;

export type ApplicationMetadataItem = {
  label: string;
  value: string;
  visibility: MetadataVisibility;
  restrictedRoleIds?: string[];
};
