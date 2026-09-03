import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ListRecordsDto } from "./dto/list-records.dto";

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: ListRecordsDto) {
    const capturedAt: Prisma.DateTimeFilter = {};
    if (query.from) capturedAt.gte = new Date(query.from);
    if (query.to) {
      const end = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to))
        end.setUTCHours(23, 59, 59, 999);
      capturedAt.lte = end;
    }
    const where: Prisma.FieldRecordWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              {
                user: {
                  is: { name: { contains: query.search, mode: "insensitive" } },
                },
              },
              {
                user: {
                  is: {
                    email: { contains: query.search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
      ...(query.from || query.to ? { capturedAt } : {}),
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [items, total, withPhoto, capturedToday] =
      await this.prisma.$transaction([
        this.prisma.fieldRecord.findMany({
          where,
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { capturedAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.fieldRecord.count({ where }),
        this.prisma.fieldRecord.count({
          where: { deletedAt: null, photoKey: { not: null } },
        }),
        this.prisma.fieldRecord.count({
          where: { deletedAt: null, capturedAt: { gte: today } },
        }),
      ]);
    return {
      items: await Promise.all(items.map((item) => this.serialize(item))),
      page: query.page,
      pageSize: query.pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / query.pageSize)),
      summary: { total, withPhoto, capturedToday },
    };
  }

  async detail(id: string) {
    const item = await this.prisma.fieldRecord.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!item) throw new NotFoundException("Registro não encontrado");
    return this.serialize(item);
  }

  private async serialize<
    T extends {
      latitude: Prisma.Decimal;
      longitude: Prisma.Decimal;
      accuracy: Prisma.Decimal | null;
      photoKey: string | null;
    },
  >(item: T) {
    return {
      ...item,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      accuracy: item.accuracy === null ? null : Number(item.accuracy),
      photoUrl: item.photoKey
        ? await this.storage.photoUrl(item.photoKey)
        : null,
    };
  }
}
