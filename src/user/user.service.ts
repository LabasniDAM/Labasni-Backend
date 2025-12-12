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
  balance?: number;

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
    // ✨ CRITIQUE : Toujours convertir en string pour éviter les problèmes avec ObjectId
    safeUser.id = String(safeUser.id ?? user._id);
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

  async addToBalance(userId: string, amountInCents: number): Promise<SafeUser> {
  if (amountInCents <= 0) {
    throw new BadRequestException('Le montant doit être positif');
  }

  const user = await this.userModel.findById(userId).exec();
  if (!user) {
    throw new NotFoundException('Utilisateur introuvable');
  }

  // ON AJOUTE LE MONTANT → 80 + 50 = 130 GARANTI
  user.balance = (user.balance || 0) + amountInCents;
  await user.save();

  // ON UTILISE "id" QUI EXISTE DÉJÀ SUR LE DOCUMENT MONGOOSE
  const plain = user.toObject({ getters: true });

  return {
    ...plain,
    id: user.id, // user.id EXISTE TOUJOURS, C'EST LE GETTER DE MONGOOSE
    _id: undefined,
    __v: undefined,
    password: undefined,
  } as SafeUser;
}
async subtractFromBalance(userId: string, amountCents: number): Promise<SafeUser> {
  if (amountCents <= 0) {
    throw new BadRequestException('Le montant doit être positif');
  }

  // ✨ CRITIQUE : S'assurer que userId est une string valide
  // Si c'est un ObjectId, le convertir en string
  const userIdString = typeof userId === 'string' ? userId : String(userId);
  
  console.log('🔍 [UserService] subtractFromBalance');
  console.log('   👤 userId (param):', userId);
  console.log('   👤 userId type:', typeof userId);
  console.log('   👤 userIdString:', userIdString);
  console.log('   👤 userIdString type:', typeof userIdString);
  
  const user = await this.userModel.findById(userIdString).exec();
  if (!user) {
    console.error('❌ [UserService] User not found with userId:', userIdString);
    throw new NotFoundException('Utilisateur introuvable');
  }

  if ((user.balance || 0) < amountCents) {
    throw new BadRequestException('Solde insuffisant');
  }

  user.balance -= amountCents;
  await user.save();

  const plain = user.toObject({ getters: true });

  return {
    ...plain,
    id: user.id,
    _id: undefined,
    __v: undefined,
    password: undefined,
  } as SafeUser;
}

  
}