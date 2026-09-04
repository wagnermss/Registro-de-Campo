import { IsDateString, IsOptional } from "class-validator";

export class PullDto {
  @IsOptional()
  @IsDateString()
  cursor?: string;
}
