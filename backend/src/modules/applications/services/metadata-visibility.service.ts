import { MetadataVisibility } from '@vault/shared';
import type { ApplicationDocument } from '../models/application.model.js';

type MetadataRow = {
  label: string;
  value: string;
  visibility: MetadataVisibility;
  restrictedRoleIds?: { toString(): string }[];
};

export type MetadataViewContext = {
  userId: string;
  ownerId: string;
  tenantRoleIds: string[];
  canViewRestricted: boolean;
};

export class MetadataVisibilityService {
  filterForViewer(
    metadata: ApplicationDocument['metadata'],
    ctx: MetadataViewContext,
  ): Array<{ label: string; value: string; visibility: MetadataVisibility }> {
    const rows = (metadata ?? []) as MetadataRow[];
    return rows
      .filter((item) => this.canViewItem(item, ctx))
      .map((item) => ({
        label: item.label,
        value: this.maskValueIfNeeded(item, ctx),
        visibility: item.visibility as MetadataVisibility,
      }));
  }

  private canViewItem(item: MetadataRow, ctx: MetadataViewContext): boolean {
    switch (item.visibility) {
      case MetadataVisibility.TENANT_VISIBLE:
        return true;
      case MetadataVisibility.OWNER_ONLY:
        return ctx.userId === ctx.ownerId || ctx.canViewRestricted;
      case MetadataVisibility.ROLE_RESTRICTED: {
        const allowed = (item.restrictedRoleIds ?? []).map((id) => id.toString());
        if (ctx.canViewRestricted) return true;
        return allowed.some((roleId) => ctx.tenantRoleIds.includes(roleId));
      }
      case MetadataVisibility.APPROVAL_REQUIRED:
        return ctx.userId === ctx.ownerId || ctx.canViewRestricted;
      default:
        return false;
    }
  }

  private maskValueIfNeeded(item: MetadataRow, ctx: MetadataViewContext): string {
    if (item.visibility === MetadataVisibility.APPROVAL_REQUIRED) {
      if (ctx.userId === ctx.ownerId || ctx.canViewRestricted) {
        return item.value;
      }
      return '[Approval required]';
    }
    return item.value;
  }
}
