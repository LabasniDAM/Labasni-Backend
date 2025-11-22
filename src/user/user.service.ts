import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

export interface CreateUserInput {
  fullName: string;
  email: string;
  password?: string;
  gender?: 'male' | 'female';
  preferences?: string[];
  phoneNumber?: string;
  authProvider?: 'local' | 'google' | 'apple';
  googleId?: string;
  appleId?: string;
  profilePicture?: string;
  isVerified?: boolean;
  verificationCode?: string;
  verificationCodeExpiresAt?: Date;
  resetOtpCode?: string | null;
  resetOtpExpiresAt?: Date | null;
  
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  password?: string;
  gender?: 'male' | 'female';
  preferences?: string[];
  phoneNumber?: string;
  authProvider?: 'local' | 'google' | 'apple';
  googleId?: string;
  appleId?: string;
  profilePicture?: string;

  // Champs pour vérification email
  isVerified?: boolean;
  verificationCode?: string | null;
  verificationCodeExpiresAt?: Date | null;
  resetOtpCode?: string | null;
  resetOtpExpiresAt?: Date | null;
}



export type SafeUser = Omit<User, 'password'> & {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(data: CreateUserInput): Promise<SafeUser> {
    const user = new this.userModel({
      ...data,
      email: data.email.toLowerCase(),
    });
    const savedUser = await user.save();
    const safeUser = savedUser.toObject() as SafeUser;
    safeUser.id = safeUser.id ?? String(savedUser._id);
    return safeUser;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .exec();
  }

  async findById(id: string | Types.ObjectId): Promise<SafeUser | null> {
    const filter: FilterQuery<UserDocument> = {
      _id: typeof id === 'string' ? new Types.ObjectId(id) : id,
    };
    const user = await this.userModel.findOne(filter).exec();
    if (!user) {
      return null;
    }
    const safeUser = user.toObject() as SafeUser;
    safeUser.id = safeUser.id ?? String(user._id);
    return safeUser;
  }

  async existsByEmail(
    email: string,
    excludeId?: string | Types.ObjectId,
  ): Promise<boolean> {
    const filter: FilterQuery<UserDocument> = {
      email: email.toLowerCase(),
    };
    if (excludeId) {
      filter._id = {
        $ne: typeof excludeId === 'string' ? new Types.ObjectId(excludeId) : excludeId,
      };
    }
    const count = await this.userModel.countDocuments(filter).exec();
    return count > 0;
  }

  async updateById(
    id: string | Types.ObjectId,
    updates: UpdateUserInput,
  ): Promise<SafeUser | null> {
    const normalizedUpdates: UpdateUserInput = { ...updates };
    if (normalizedUpdates.email) {
      normalizedUpdates.email = normalizedUpdates.email.toLowerCase();
    }

    // Séparer les champs à mettre à jour et ceux à supprimer
    const setFields: any = {};
    const unsetFields: any = {};

    Object.entries(normalizedUpdates).forEach(([key, value]) => {
      if (value === undefined) {
        unsetFields[key] = '';
      } else {
        setFields[key] = value;
      }
    });

    // Construire l'opération de mise à jour
    const updateOperation: any = {};
    if (Object.keys(setFields).length > 0) {
      updateOperation.$set = setFields;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateOperation.$unset = unsetFields;
    }

    // Si aucune opération, retourner l'utilisateur existant
    if (Object.keys(updateOperation).length === 0) {
      return this.findById(id);
    }

    const user = await this.userModel
      .findOneAndUpdate(
        { _id: typeof id === 'string' ? new Types.ObjectId(id) : id },
        updateOperation,
        { new: true, runValidators: true },
      )
      .exec();

    if (!user) {
      return null;
    }

    const safeUser = user.toObject() as SafeUser;
    safeUser.id = safeUser.id ?? String(user._id);
    return safeUser;
  }

  async removeById(id: string | Types.ObjectId): Promise<void> {
    await this.userModel
      .deleteOne({
        _id: typeof id === 'string' ? new Types.ObjectId(id) : id,
      })
      .exec();
  }

  async findByGoogleId(googleId: string): Promise<SafeUser | null> {
    const user = await this.userModel.findOne({ googleId }).exec();
    if (!user) {
      return null;
    }
    const safeUser = user.toObject() as SafeUser;
    safeUser.id = safeUser.id ?? String(user._id);
    return safeUser;
  }

  async findByAppleId(appleId: string): Promise<SafeUser | null> {
    const user = await this.userModel.findOne({ appleId }).exec();
    if (!user) {
      return null;
    }
    const safeUser = user.toObject() as SafeUser;
    safeUser.id = safeUser.id ?? String(user._id);
    return safeUser;
  }

  async addToBalance(userId: string, amount: number): Promise<SafeUser | null> {
  if (amount <= 0) {
    throw new BadRequestException('Amount must be positive');
  }
  
  // Récupérer l'utilisateur
  const user = await this.userModel.findById(userId).exec();
  if (!user) {
    throw new NotFoundException(`User with ID ${userId} not found`);
  }

  // Incrémenter le balance
  user.balance = (user.balance || 0) + amount;
  await user.save();

  // Retourner SafeUser
  const safeUser = user.toObject() as SafeUser;
  safeUser.id = safeUser.id ?? String(user._id);
  return safeUser;
}
  
}