import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateRepresentativeCharacterDto {
  @IsString()
  @IsNotEmpty()
  Name: string;
}
