import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { BUILT_IN_ROLE_NAMES } from '@vault/shared';

const roleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null,
      index: true,
    },
    isBuiltIn: { type: Boolean, default: false },
    builtInKey: {
      type: String,
      enum: [...Object.values(BUILT_IN_ROLE_NAMES), null],
      default: null,
    },
    permissionKeys: [{ type: String, required: true }],
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

roleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export type RoleDocument = InferSchemaType<typeof roleSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RoleModel = mongoose.model('Role', roleSchema);
