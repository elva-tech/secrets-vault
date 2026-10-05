import mongoose from 'mongoose';
import { RoleModel, type RoleDocument } from '../models/role.model.js';
import { BUILT_IN_ROLE_NAMES } from '@vault/shared';

export class RoleRepository {
  async findPlatformSuperAdminRole(): Promise<RoleDocument | null> {
    return RoleModel.findOne({
      isBuiltIn: true,
      builtInKey: BUILT_IN_ROLE_NAMES.SUPER_ADMIN,
      tenantId: null,
    }).exec();
  }

  async findTenantBusinessAdminRole(tenantId: string): Promise<RoleDocument | null> {
    return RoleModel.findOne({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      isBuiltIn: true,
      builtInKey: BUILT_IN_ROLE_NAMES.BUSINESS_ADMIN,
    }).exec();
  }

  async findByIdWithinTenant(id: string, tenantId: string): Promise<RoleDocument | null> {
    return RoleModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async listByTenant(tenantId: string): Promise<RoleDocument[]> {
    return RoleModel.find({
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }

  async createTenantRole(data: {
    tenantId: string;
    name: string;
    permissionKeys: string[];
    description?: string;
    isBuiltIn?: boolean;
    builtInKey?: string | null;
  }): Promise<RoleDocument> {
    return RoleModel.create({
      tenantId: new mongoose.Types.ObjectId(data.tenantId),
      name: data.name,
      permissionKeys: data.permissionKeys,
      description: data.description ?? '',
      isBuiltIn: data.isBuiltIn ?? false,
      builtInKey: data.builtInKey ?? null,
    });
  }

  async findByIdsWithinTenant(ids: string[], tenantId: string): Promise<RoleDocument[]> {
    return RoleModel.find({
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      tenantId: new mongoose.Types.ObjectId(tenantId),
    }).exec();
  }
}
