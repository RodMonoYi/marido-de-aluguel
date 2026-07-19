import { IsIn } from 'class-validator';

export class ListServiceRequestsDto {
  @IsIn(['mine', 'opportunities'])
  declare scope: 'mine' | 'opportunities';
}
