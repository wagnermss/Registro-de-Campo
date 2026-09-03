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
  Min,
  ValidateNested,
} from "class-validator";

export enum SyncOperationType {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
}

export class SyncRecordPayloadDto {
  @IsUUID() id!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsNumber() latitude!: number;
  @IsNumber() longitude!: number;
  @IsDateString() capturedAt!: string;
  @IsOptional() @IsString() photoKey?: string | null;
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
