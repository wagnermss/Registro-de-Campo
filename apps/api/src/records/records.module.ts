import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { RolesGuard } from "../auth/roles.guard";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  imports: [StorageModule],
  controllers: [RecordsController],
  providers: [RecordsService, RolesGuard],
})
export class RecordsModule {}
