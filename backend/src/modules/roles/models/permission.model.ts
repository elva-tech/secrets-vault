import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true },
    description: { type: String, default: '' },
  },
  { timestamps: true },
);

export type PermissionDocument = InferSchemaType<typeof permissionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PermissionModel = mongoose.model('Permission', permissionSchema);
