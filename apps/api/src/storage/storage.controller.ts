import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { StorageService } from "./storage.service";

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("photos")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async uploadPhoto(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.mimetype.startsWith("image/"))
      throw new BadRequestException("Envie um arquivo de imagem válido");
    return {
      storageKey: await this.storage.uploadRecordPhoto(request.user.sub, file),
    };
  }
}
