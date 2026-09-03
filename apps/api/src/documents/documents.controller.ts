import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtPayload } from "../auth/jwt.strategy";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { SetDocumentStatusDto } from "./dto/set-document-status.dto";
import { DocumentsService } from "./documents.service";

type AuthenticatedRequest = Request & { user: JwtPayload };
const documentUpload = FileInterceptor("file", {
  limits: { fileSize: 30 * 1024 * 1024 },
});

@Controller("documents")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  listActive() {
    return this.documents.listActive();
  }

  @Get("admin")
  @Roles(UserRole.ADMIN)
  listForAdmin() {
    return this.documents.listForAdmin();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(documentUpload)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documents.create(request.user.sub, dto, file);
  }

  @Put(":id/file")
  @Roles(UserRole.ADMIN)
  @UseInterceptors(documentUpload)
  replace(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documents.replace(id, request.user.sub, file);
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN)
  setStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SetDocumentStatusDto,
  ) {
    return this.documents.setStatus(id, dto.isActive);
  }

  @Get(":id/download")
  download(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.documents.download(id, request.user.role === UserRole.ADMIN);
  }
}
