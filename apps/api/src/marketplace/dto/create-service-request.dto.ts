import { Type } from 'class-transformer';
import {
  Equals,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class ApproximateLocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare city: string;

  @Matches(/^[A-Z]{2}$/)
  declare state: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare district?: string | null;
}

class DesiredWindowDto {
  @IsDateString()
  declare startsAt: string;

  @IsDateString()
  declare endsAt: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  declare timezone: string;
}

class RequestBudgetDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  declare minMinor?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  declare maxMinor?: number | null;

  @Equals('BRL')
  declare currency: 'BRL';
}

export class CreateServiceRequestDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  declare categoryId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(120)
  declare title: string;

  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  declare description: string;

  @IsObject()
  @ValidateNested()
  @Type(() => ApproximateLocationDto)
  declare locationApprox: ApproximateLocationDto;

  @IsObject()
  @ValidateNested()
  @Type(() => DesiredWindowDto)
  declare desiredWindow: DesiredWindowDto;

  @IsIn(['FLEXIBLE', 'WITHIN_7_DAYS', 'URGENT'])
  declare urgency: 'FLEXIBLE' | 'WITHIN_7_DAYS' | 'URGENT';

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => RequestBudgetDto)
  declare budget?: RequestBudgetDto | null;

  @Equals('PRIVATE_MATCHED')
  declare visibility: 'PRIVATE_MATCHED';

  @IsDateString()
  declare proposalDeadline: string;
}
