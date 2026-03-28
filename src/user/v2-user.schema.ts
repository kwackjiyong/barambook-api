import { Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'v2_users' })
export class V2User extends Document {
  @Prop({ required: true, unique: true, index: true })
  Name: string;

  @Prop({ type: String, default: null })
  ClanName: string | null;

  @Prop({ type: String })
  Class: string;

  @Prop({ type: Number })
  Grade: number;

  @Prop({ type: Number })
  Level: number;

  @Prop({ type: Number, default: null })
  MaxHP: number | null;

  @Prop({ type: Number, default: null })
  MaxMP: number | null;

  @Prop({ type: String })
  Nation: string;

  @Prop({ type: String })
  Score: string;

  @Prop({ type: Number })
  Power: number;

  @Prop({ type: Number })
  Rating: number;

  @Prop({ type: String })
  WorldInstanceId: string;
}

export const V2UserSchema = SchemaFactory.createForClass(V2User);
