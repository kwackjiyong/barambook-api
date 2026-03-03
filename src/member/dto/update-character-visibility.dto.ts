import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class UpdateCharacterVisibilityDto {
  @IsString()
  @IsNotEmpty()
  Name: string;

  @IsBoolean()
  isHidden: boolean;
}
