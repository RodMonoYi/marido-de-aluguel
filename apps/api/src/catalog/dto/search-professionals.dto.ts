import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class SearchProfessionalsDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  declare category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  declare city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  declare cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  declare limit?: number;
}
