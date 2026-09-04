import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtPayload } from "./jwt.strategy";

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password, body.deviceName);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.profile(request.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Req() request: AuthenticatedRequest) {
    return this.auth.logout(request.user.sub, request.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("password")
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      request.user.sub,
      body.currentPassword,
      body.newPassword,
    );
  }
}
