import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

/** Legacy character data. MSWID is intentionally Mixed to preserve numeric BSON values exactly. */
@Schema({ collection: 'v2_users', strict: false })
export class UserV2 extends Document {
  @Prop({ type: String, required: true, index: true })
  Name: string;

  @Prop({ type: SchemaTypes.Mixed, index: true })
  MSWID: unknown;
}

export const UserV2Schema = SchemaFactory.createForClass(UserV2);

@Schema({
  collection: 'hopae_searches',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class HopaeSearch extends Document {
  @Prop({ type: String, required: true, trim: true })
  Name: string;

  @Prop({ type: String, required: true })
  ipHash: string;

  @Prop({ type: String, required: true })
  searchDateKey: string;

  createdAt: Date;
}

export const HopaeSearchSchema = SchemaFactory.createForClass(HopaeSearch);

HopaeSearchSchema.index(
  { ipHash: 1, Name: 1, searchDateKey: 1 },
  { unique: true },
);
HopaeSearchSchema.index({ searchDateKey: 1, Name: 1 });
HopaeSearchSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 31 * 24 * 60 * 60 },
);
