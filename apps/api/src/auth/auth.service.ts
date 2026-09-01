import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh') throw new UnauthorizedException();
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Sessão expirada; entre novamente');
    }
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  private async issueTokens(user: User) {
    const basePayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync({ ...basePayload, type: 'access' }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '15m',
    });
    const refreshToken = await this.jwt.signAsync({ ...basePayload, type: 'refresh' }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: '30d',
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) },
    });
    return { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }
}
