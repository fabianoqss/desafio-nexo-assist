import type { User } from '../model/user.ts';

export interface UserRepository {
  findByEmail(email: string): Promise<User | undefined>;
  findById(id: string): Promise<User | undefined>;
  findManyByIds(ids: readonly string[]): Promise<User[]>;
  upsertMany(users: readonly User[]): Promise<void>;
}
