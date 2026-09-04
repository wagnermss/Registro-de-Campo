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
const allowedPhotoMimeTypes = new Set(["image/jpeg", "image/png"]);

function hasValidPhotoSignature(file: Express.Multer.File) {
  if (file.mimetype === "image/jpeg")
    return (
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff
    );
  if (file.mimetype === "image/png")
    return (
      file.buffer.length >= 8 &&
      file.buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    );
  return false;
}

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
    if (
      !file ||
      !allowedPhotoMimeTypes.has(file.mimetype) ||
      !hasValidPhotoSignature(file)
    )
      throw new BadRequestException("Envie um arquivo de imagem válido");
    return {
      storageKey: await this.storage.uploadRecordPhoto(request.user.sub, file),
    };
  }
}
