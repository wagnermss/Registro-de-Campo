import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}
