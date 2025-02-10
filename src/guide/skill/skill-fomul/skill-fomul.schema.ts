import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
interface AttackSkill {
  name: string;
  ac?: number;
  hp?: number;
  mp?: number;
  mpMax?: number;
  mpMinus?: number;
  isWarrior?: boolean;
  refInt?: number;
}
interface DebufSkill {
  ac: number;
  name: string;
}
@Schema()
export class SkillFomul extends Document {
  @Prop({ required: true })
  _id: string;

  @Prop()
  attack: Array<AttackSkill>;

  @Prop()
  hill: Array<string>;

  @Prop()
  debuf: Array<DebufSkill>;
}

export const SkillFomulSchema = SchemaFactory.createForClass(SkillFomul);
