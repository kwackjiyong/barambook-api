import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';

export interface ChannelCampfire {
  id: string;
  x: number;
  y: number;
  placedAt: string;
  expiresAt: string;
}
export const CAMPFIRE_LIFETIME_MS = 30 * 60 * 1000;
export const CAMPFIRE_CLEARANCE = 4 * 24;

export class CampfireStore {
  private fires: ChannelCampfire[] = [];
  constructor(private readonly filename?: string) {
    if (filename && existsSync(filename)) {
      try {
      const saved: unknown = JSON.parse(readFileSync(filename, 'utf8'));
      if (Array.isArray(saved)) this.fires = saved.filter((fire) =>
        typeof fire?.id === 'string' && Number.isFinite(fire.x) && Number.isFinite(fire.y) &&
        typeof fire.placedAt === 'string' && Date.parse(fire.expiresAt) > Date.now(),
      );
      } catch (error) {
        new Logger(CampfireStore.name).error('Unable to restore campfires', error);
      }
    }
  }
  list(now = Date.now()): ChannelCampfire[] {
    return this.fires.filter((fire) => Date.parse(fire.expiresAt) > now);
  }
  place(x: number, y: number, now = Date.now()): { fire?: ChannelCampfire; error?: string } {
    this.expire(now);
    if (this.fires.some((fire) => Math.abs(fire.x - x) <= CAMPFIRE_CLEARANCE &&
      Math.abs(fire.y - y) <= CAMPFIRE_CLEARANCE)) {
      return { error: '주변 9×9칸 안에 이미 모닥불이 있습니다.' };
    }
    if (this.fires.length >= 200) return { error: '이 맵에는 모닥불을 더 설치할 수 없습니다.' };
    const fire: ChannelCampfire = {
      id: randomUUID(), x, y, placedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + CAMPFIRE_LIFETIME_MS).toISOString(),
    };
    this.fires.push(fire);
    this.save();
    return { fire };
  }
  expire(now = Date.now()): ChannelCampfire[] {
    const expired = this.fires.filter((fire) => Date.parse(fire.expiresAt) <= now);
    if (expired.length) {
      this.fires = this.fires.filter((fire) => Date.parse(fire.expiresAt) > now);
      this.save();
    }
    return expired;
  }
  private save() {
    if (!this.filename) return;
    mkdirSync(dirname(this.filename), { recursive: true });
    writeFileSync(`${this.filename}.tmp`, JSON.stringify(this.fires));
    renameSync(`${this.filename}.tmp`, this.filename);
  }
}
