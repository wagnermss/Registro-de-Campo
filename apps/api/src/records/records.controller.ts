import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListRecordsDto } from "./dto/list-records.dto";
import { RecordsService } from "./records.service";

@Controller("records")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class RecordsController {
  constructor(private readonly records: RecordsService) {}
  @Get() list(@Query() query: ListRecordsDto) {
    return this.records.list(query);
  }
  @Get(":id") detail(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.records.detail(id);
  }

  @Delete(":id") remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.records.remove(id);
  }
}
