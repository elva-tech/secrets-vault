import { UserModel, type UserDocument } from '../models/user.model.js';

export class UserRepository {
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return UserModel.findById(id).exec();
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName: string;
    isPlatformSuperAdmin?: boolean;
  }): Promise<UserDocument> {
    return UserModel.create(data);
  }
}
