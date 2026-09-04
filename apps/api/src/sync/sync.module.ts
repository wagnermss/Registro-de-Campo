import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [StorageModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
