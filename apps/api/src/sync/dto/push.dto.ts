import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum SyncOperationType {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
}

export class SyncRecordPayloadDto {
  @IsUUID() id!: string;
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @IsDateString() capturedAt!: string;
  @IsOptional() @IsString() @MaxLength(500) photoKey?: string | null;
}

export class SyncOperationDto {
  @IsUUID() operationId!: string;
  @IsUUID() recordId!: string;
  @IsEnum(SyncOperationType) type!: SyncOperationType;
  @IsInt() @Min(0) baseVersion!: number;
  @ValidateNested()
  @Type(() => SyncRecordPayloadDto)
  payload!: SyncRecordPayloadDto;
}

export class PushDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}
