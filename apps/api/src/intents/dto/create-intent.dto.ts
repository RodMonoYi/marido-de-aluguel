import { Equals, IsIn, IsUUID } from 'class-validator';

export class CreateIntentDto {
  @IsUUID()
  declare professionalId: string;

  @IsUUID()
  declare serviceId: string;

  @IsIn(['REQUEST_QUOTE'])
  @Equals('REQUEST_QUOTE')
  declare action: 'REQUEST_QUOTE';
}
