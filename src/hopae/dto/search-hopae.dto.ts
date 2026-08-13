import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SearchHopaeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;
}
