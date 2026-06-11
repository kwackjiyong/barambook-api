import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  auth: string;
}

export class SavePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class DeletePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  endpoint: string;
}
