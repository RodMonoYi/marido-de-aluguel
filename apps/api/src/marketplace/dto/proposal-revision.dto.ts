import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ProposalAmountsDto {
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  declare laborMinor: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  declare materialsMinor: number;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  declare travelMinor: number;

  @Equals('BRL')
  declare currency: 'BRL';
}

class ProposalScheduleDto {
  @IsDateString()
  declare startsAt: string;

  @IsDateString()
  declare endsAt: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  declare timezone: string;
}

export class ProposalRevisionDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4000)
  declare scope: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  declare included: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  declare excluded: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => ProposalAmountsDto)
  declare amounts: ProposalAmountsDto;

  @IsObject()
  @ValidateNested()
  @Type(() => ProposalScheduleDto)
  declare schedule: ProposalScheduleDto;

  @IsDateString()
  declare validUntil: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  declare guaranteeOffer: string | null;
}
