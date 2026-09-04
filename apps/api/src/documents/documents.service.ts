import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateDocumentDto } from "./dto/create-document.dto";

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
]);

const zipMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const legacyOfficeMimeTypes = new Set([
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

function startsWith(file: Express.Multer.File, signature: string) {
  const expected = Buffer.from(signature, "hex");
  return (
    file.buffer.length >= expected.length &&
    file.buffer.subarray(0, expected.length).equals(expected)
  );
}

function hasValidDocumentSignature(file: Express.Multer.File) {
  if (file.mimetype === "application/pdf")
    return file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (file.mimetype === "image/jpeg") return startsWith(file, "ffd8ff");
  if (file.mimetype === "image/png")
    return startsWith(file, "89504e470d0a1a0a");
  if (zipMimeTypes.has(file.mimetype)) return startsWith(file, "504b0304");
  if (legacyOfficeMimeTypes.has(file.mimetype))
    return startsWith(file, "d0cf11e0a1b11ae1");
  if (file.mimetype === "text/plain" || file.mimetype === "text/csv")
    return !file.buffer.includes(0);
  return false;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listActive() {
    return this.prisma.document.findMany({
      where: { isActive: true },
      select: this.publicSelection,
      orderBy: { updatedAt: "desc" },
    });
  }

  listForAdmin() {
    return this.prisma.document.findMany({
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(
    uploadedById: string,
    dto: CreateDocumentDto,
    file?: Express.Multer.File,
  ) {
    this.validateFile(file);
    const id = randomUUID();
    const storageKey = await this.storage.uploadDocument(id, 1, file);
    try {
      return await this.prisma.document.create({
        data: {
          id,
          name: dto.name?.trim() || file.originalname,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256: this.checksum(file.buffer),
          storageKey,
          uploadedById,
        },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async replace(id: string, uploadedById: string, file?: Express.Multer.File) {
    this.validateFile(file);
    const current = await this.prisma.document.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Documento não encontrado");
    const version = current.version + 1;
    const storageKey = await this.storage.uploadDocument(id, version, file);
    try {
      const updated = await this.prisma.document.update({
        where: { id },
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksumSha256: this.checksum(file.buffer),
          storageKey,
          version,
          uploadedById,
        },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      });
      await this.storage.remove(current.storageKey).catch(() => undefined);
      return updated;
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async setStatus(id: string, isActive: boolean) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Documento não encontrado");
    return this.prisma.document.update({
      where: { id },
      data: { isActive },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async download(id: string, includeInactive: boolean) {
    const document = await this.prisma.document.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true }) },
    });
    if (!document) throw new NotFoundException("Documento não encontrado");
    return {
      url: await this.storage.documentUrl(
        document.storageKey,
        document.originalName,
      ),
      expiresInSeconds: 15 * 60,
      checksumSha256: document.checksumSha256,
      version: document.version,
    };
  }

  private validateFile(
    file?: Express.Multer.File,
  ): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException("Selecione um documento");
    if (!allowedMimeTypes.has(file.mimetype))
      throw new BadRequestException("Tipo de documento não permitido");
    if (!hasValidDocumentSignature(file))
      throw new BadRequestException(
        "O conteúdo do arquivo não corresponde ao tipo informado",
      );
  }

  private checksum(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
  }

  private readonly publicSelection = {
    id: true,
    name: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    checksumSha256: true,
    version: true,
    updatedAt: true,
  } as const;
}
