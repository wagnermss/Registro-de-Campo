import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "./jwt.strategy";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string, deviceName?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("E-mail ou senha inválidos");
    }
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        deviceName,
        refreshTokenHash: "pending",
        expiresAt: this.refreshExpiration(),
      },
    });
    return this.issueTokens(user, session.id);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
      if (payload.type !== "refresh") throw new UnauthorizedException();
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      });
      if (
        !session ||
        !(await bcrypt.compare(refreshToken, session.refreshTokenHash))
      ) {
        throw new UnauthorizedException();
      }
      return this.issueTokens(session.user, session.id);
    } catch {
      throw new UnauthorizedException("Sessão expirada; entre novamente");
    }
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async logout(userId: string, sessionId: string) {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  private async issueTokens(user: User, sessionId: string) {
    const basePayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };
    const accessToken = await this.jwt.signAsync(
      { ...basePayload, type: "access" },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: "15m",
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...basePayload, type: "refresh" },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: "30d",
      },
    );
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, 12),
        expiresAt: this.refreshExpiration(),
      },
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  private refreshExpiration() {
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
}
