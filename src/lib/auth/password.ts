import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
