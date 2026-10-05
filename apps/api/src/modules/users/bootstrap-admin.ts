import { Prisma, PrismaClient } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';
import { PasswordService } from '../auth/password.service';

export async function bootstrapAdmin(db: PrismaClient, email: string | undefined, password: string | undefined) {
  const input = plainToInstance(CreateUserDto, { email, password, displayName: 'Bootstrap', role: 'CLINIC_ADMIN' });
  if (validateSync(input).length) throw new Error('BOOTSTRAP_ADMIN_EMAIL y BOOTSTRAP_ADMIN_PASSWORD deben ser válidos (contraseña: 12–128 caracteres).');
  const check = (user: { id: string; isSystemAdmin: boolean }) => {
    if (!user.isSystemAdmin) throw new Error('El email ya pertenece a un usuario ordinario; no se promueve automáticamente.');
    return { id: user.id, created: false };
  };
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true, isSystemAdmin: true } });
  if (existing) return check(existing);
  const passwordHash = await new PasswordService().hash(input.password);
  try {
    const user = await db.user.create({ data: { email: input.email, passwordHash, isSystemAdmin: true }, select: { id: true } });
    return { id: user.id, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await db.user.findUnique({ where: { email: input.email }, select: { id: true, isSystemAdmin: true } });
      if (raced) return check(raced);
    }
    throw error;
  }
}
