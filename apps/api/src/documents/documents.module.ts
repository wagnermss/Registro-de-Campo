import { Module } from "@nestjs/common";
import { RolesGuard } from "../auth/roles.guard";
import { StorageModule } from "../storage/storage.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [StorageModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, RolesGuard],
})
export class DocumentsModule {}
