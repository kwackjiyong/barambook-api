import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
interface SkillInterface {
  title: string;
  consume: string;
  delay: string;
  desc: string;
  effect: Array<string>;
  level: string;
  scaleUp?: boolean;
  class?: number;
  noImg?: boolean;
  matl: Array<{
    id: number;
    cnt: number;
    desc: string;
    unit: string;
  }>;
}

@Schema()
export class Skill extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  job: string;

  @Prop()
  desc: string;

  @Prop()
  skills: Array<SkillInterface>;
}

export const SkillSchema = SchemaFactory.createForClass(Skill);
