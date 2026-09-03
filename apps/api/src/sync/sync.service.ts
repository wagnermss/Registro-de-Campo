import { Injectable } from "@nestjs/common";
import { Prisma, SyncOperationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SyncOperationDto, SyncOperationType } from "./dto/push.dto";

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async push(userId: string, operations: SyncOperationDto[]) {
    const results = [];
    for (const operation of operations)
      results.push(await this.apply(userId, operation));
    return { results };
  }

  private async apply(userId: string, operation: SyncOperationDto) {
    if (operation.payload.id !== operation.recordId) {
      return {
        operationId: operation.operationId,
        recordId: operation.recordId,
        status: SyncOperationStatus.REJECTED,
      };
    }
    const previous = await this.prisma.syncOperation.findUnique({
      where: { id: operation.operationId },
      include: { record: true },
    });
    if (previous) {
      if (previous.userId !== userId)
        return {
          operationId: operation.operationId,
          recordId: operation.recordId,
          status: SyncOperationStatus.REJECTED,
        };
      return {
        operationId: operation.operationId,
        recordId: operation.recordId,
        status: previous.status,
        version: previous.record.version,
        ...(previous.status === SyncOperationStatus.CONFLICT
          ? { serverRecord: this.serialize(previous.record) }
          : {}),
      };
    }
    const current = await this.prisma.fieldRecord.findUnique({
      where: { id: operation.recordId },
    });

    if (operation.type === SyncOperationType.CREATE && !current) {
      const created = await this.prisma.$transaction(async (tx) => {
        const record = await tx.fieldRecord.create({
          data: {
            id: operation.recordId,
            userId,
            title: operation.payload.title,
            description: operation.payload.description,
            latitude: operation.payload.latitude,
            longitude: operation.payload.longitude,
            capturedAt: new Date(operation.payload.capturedAt),
            photoKey: operation.payload.photoKey,
          },
        });
        await tx.syncOperation.create({
          data: {
            id: operation.operationId,
            recordId: record.id,
            userId,
            type: operation.type,
            baseVersion: operation.baseVersion,
            payload: operation.payload as unknown as Prisma.InputJsonValue,
            status: SyncOperationStatus.APPLIED,
            processedAt: new Date(),
          },
        });
        return record;
      });
      return {
        operationId: operation.operationId,
        recordId: created.id,
        status: SyncOperationStatus.APPLIED,
        version: created.version,
      };
    }

    if (!current || current.userId !== userId) {
      return {
        operationId: operation.operationId,
        recordId: operation.recordId,
        status: SyncOperationStatus.REJECTED,
      };
    }

    if (current.version !== operation.baseVersion) {
      await this.prisma.syncOperation.create({
        data: {
          id: operation.operationId,
          recordId: current.id,
          userId,
          type: operation.type,
          baseVersion: operation.baseVersion,
          payload: operation.payload as unknown as Prisma.InputJsonValue,
          status: SyncOperationStatus.CONFLICT,
          processedAt: new Date(),
        },
      });
      return {
        operationId: operation.operationId,
        recordId: operation.recordId,
        status: SyncOperationStatus.CONFLICT,
        version: current.version,
        reason: current.deletedAt ? "RECORD_DELETED" : "VERSION_MISMATCH",
        serverRecord: this.serialize(current),
      };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.fieldRecord.update({
        where: { id: current.id },
        data:
          operation.type === SyncOperationType.DELETE
            ? { deletedAt: new Date(), version: { increment: 1 } }
            : {
                title: operation.payload.title,
                description: operation.payload.description,
                latitude: operation.payload.latitude,
                longitude: operation.payload.longitude,
                photoKey: operation.payload.photoKey,
                deletedAt: null,
                version: { increment: 1 },
              },
      });
      await tx.syncOperation.create({
        data: {
          id: operation.operationId,
          recordId: record.id,
          userId,
          type: operation.type,
          baseVersion: operation.baseVersion,
          payload: operation.payload as unknown as Prisma.InputJsonValue,
          status: SyncOperationStatus.APPLIED,
          processedAt: new Date(),
        },
      });
      return record;
    });
    return {
      operationId: operation.operationId,
      recordId: updated.id,
      status: SyncOperationStatus.APPLIED,
      version: updated.version,
    };
  }

  async pull(userId: string, isAdmin: boolean, cursor?: string) {
    const since = cursor ? new Date(cursor) : new Date(0);
    const upperBound = new Date();
    const records = await this.prisma.fieldRecord.findMany({
      where: {
        updatedAt: { gt: since, lte: upperBound },
        ...(isAdmin ? {} : { userId }),
      },
      orderBy: { updatedAt: "asc" },
      take: 500,
    });
    return {
      records: records.map((record) => ({
        ...record,
        latitude: Number(record.latitude),
        longitude: Number(record.longitude),
        accuracy: record.accuracy === null ? null : Number(record.accuracy),
      })),
      cursor: upperBound.toISOString(),
    };
  }

  private serialize(record: {
    id: string;
    userId: string;
    title: string;
    description: string | null;
    latitude: Prisma.Decimal;
    longitude: Prisma.Decimal;
    accuracy: Prisma.Decimal | null;
    capturedAt: Date;
    photoKey: string | null;
    version: number;
    updatedAt: Date;
    deletedAt: Date | null;
  }) {
    return {
      ...record,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      accuracy: record.accuracy === null ? null : Number(record.accuracy),
    };
  }
}
