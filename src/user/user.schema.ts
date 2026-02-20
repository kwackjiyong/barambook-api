import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class User extends Document {
  @Prop({ required: true })
  _id: string;
  @Prop({ required: true, unique: true, index: true })
  Name: string;
  @Prop()
  ClanName: string;
  @Prop()
  Class: string;
  @Prop()
  Grade: number;
  @Prop()
  Level: number;
  @Prop()
  MSWID: string;
  @Prop()
  MaxHP: number;
  @Prop()
  MaxMP: number;
  @Prop()
  Nation: string;
  @Prop()
  Score: string;
  @Prop()
  WorldInstanceId: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
