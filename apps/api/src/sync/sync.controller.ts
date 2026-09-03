import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { PushDto } from "./dto/push.dto";
import { SyncService } from "./sync.service";

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller("sync")
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly sync: SyncService) {}
  @Post("push") push(
    @Req() request: AuthenticatedRequest,
    @Body() body: PushDto,
  ) {
    return this.sync.push(request.user.sub, body.operations);
  }
  @Get("pull") pull(
    @Req() request: AuthenticatedRequest,
    @Query("cursor") cursor?: string,
  ) {
    return this.sync.pull(
      request.user.sub,
      request.user.role === UserRole.ADMIN,
      cursor,
    );
  }
}
