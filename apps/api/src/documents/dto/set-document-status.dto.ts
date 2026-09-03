import { IsBoolean } from "class-validator";

export class SetDocumentStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
