import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class QueryGachaGroupsDto {
  // 그룹 이름 또는 그 안에 든 아이템 이름으로 찾는다.
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  @MaxLength(40)
  search?: string;

  @IsOptional()
  @IsIn(['cash', 'monthly', 'pickup', 'event', 'ranking'])
  category?: 'cash' | 'monthly' | 'pickup' | 'event' | 'ranking';
}
