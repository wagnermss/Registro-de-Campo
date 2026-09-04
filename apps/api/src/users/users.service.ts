import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          passwordHash: await bcrypt.hash(dto.password, 12),
          role: dto.role ?? UserRole.FIELD_USER,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      this.handleUniqueEmail(error);
    }
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    const current = await this.findUser(id);
    const nextRole = dto.role ?? current.role;
    if (actorId === id && nextRole !== UserRole.ADMIN)
      throw new BadRequestException(
        "Você não pode remover o próprio acesso administrativo",
      );
    await this.protectLastAdmin(current, nextRole, current.isActive);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id },
          data: {
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
            ...(dto.email === undefined
              ? {}
              : { email: dto.email.trim().toLowerCase() }),
            ...(dto.role === undefined ? {} : { role: dto.role }),
          },
          select: publicUserSelect,
        });
        if (nextRole !== current.role)
          await tx.authSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        return user;
      });
    } catch (error) {
      this.handleUniqueEmail(error);
    }
  }

  async setStatus(actorId: string, id: string, isActive: boolean) {
    const current = await this.findUser(id);
    if (actorId === id && !isActive)
      throw new BadRequestException("Você não pode bloquear a própria conta");
    await this.protectLastAdmin(current, current.role, isActive);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { isActive },
        select: publicUserSelect,
      });
      if (!isActive)
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return user;
    });
  }

  async resetPassword(id: string, password: string) {
    await this.findUser(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash: await bcrypt.hash(password, 12) },
      });
      await tx.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { success: true };
    });
  }

  private async findUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    return user;
  }

  private async protectLastAdmin(
    current: { role: UserRole; isActive: boolean },
    nextRole: UserRole,
    nextActive: boolean,
  ) {
    const removesActiveAdmin =
      current.role === UserRole.ADMIN &&
      current.isActive &&
      (nextRole !== UserRole.ADMIN || !nextActive);
    if (!removesActiveAdmin) return;
    const activeAdmins = await this.prisma.user.count({
      where: { role: UserRole.ADMIN, isActive: true },
    });
    if (activeAdmins <= 1)
      throw new BadRequestException(
        "É necessário manter ao menos um administrador ativo",
      );
  }

  private handleUniqueEmail(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictException("Já existe um usuário com este e-mail");
    throw error;
  }
}
