import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  HopaeDeniedRequest,
  type HopaeDenialReason,
} from './hopae-denial.schema';

const MAX_FIELD_LENGTH = 512;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface HopaeDenialInput {
  ip: string;
  forwardedFor?: string;
  name: string;
  reason: HopaeDenialReason;
  userAgent?: string;
  referer?: string;
}

/** 운영자 화면의 한 줄: IP 하나를 기간 안에서 묶은 것. */
export interface HopaeDeniedIpSummary {
  ip: string;
  count: number;
  distinctNames: number;
  firstSeen: Date;
  lastSeen: Date;
  reasons: Record<HopaeDenialReason, number>;
  /** 최근에 두드린 이름 몇 개. 무엇을 긁는지 감 잡는 용도. */
  recentNames: string[];
  lastUserAgent?: string;
  lastForwardedFor?: string;
}

export interface HopaeDeniedEvent {
  name: string;
  reason: HopaeDenialReason;
  userAgent?: string;
  referer?: string;
  forwardedFor?: string;
  createdAt: Date;
}

@Injectable()
export class HopaeDenialService {
  private readonly logger = new Logger(HopaeDenialService.name);

  constructor(
    @InjectModel('hopae_denied_requests', 'barambook')
    private readonly deniedModel: Model<HopaeDeniedRequest>,
  ) {}

  /**
   * 거부 한 건을 남긴다. 응답을 늦추지 않도록 기다리지 않고, 실패해도 삼킨다.
   * 기록이 안 됐다고 요청을 통과시킬 이유는 없고, 반대로 기록 때문에 막힐 이유도 없다.
   */
  record(input: HopaeDenialInput): void {
    const doc = {
      ip: clip(input.ip) || 'unknown',
      forwardedFor: clip(input.forwardedFor),
      name: clip(input.name),
      reason: input.reason,
      userAgent: clip(input.userAgent),
      referer: clip(input.referer),
    };

    this.deniedModel
      .create(doc)
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.warn(
          `denied-request record failed: ${(error as Error)?.message}`,
        );
      });
  }

  /** 최근 `days` 일 동안의 거부 요청을 IP 별로 묶어 많은 순으로. */
  async summarizeByIp(
    days = DEFAULT_DAYS,
    limit = DEFAULT_LIMIT,
  ): Promise<HopaeDeniedIpSummary[]> {
    const since = new Date(Date.now() - clampDays(days) * 24 * 60 * 60 * 1000);

    const rows = await this.deniedModel
      .aggregate<{
        _id: string;
        count: number;
        names: string[];
        firstSeen: Date;
        lastSeen: Date;
        reasons: HopaeDenialReason[];
        lastUserAgent?: string;
        lastForwardedFor?: string;
      }>([
        { $match: { createdAt: { $gte: since } } },
        { $sort: { createdAt: 1 } },
        {
          $group: {
            _id: '$ip',
            count: { $sum: 1 },
            names: { $addToSet: '$name' },
            firstSeen: { $first: '$createdAt' },
            lastSeen: { $last: '$createdAt' },
            reasons: { $push: '$reason' },
            lastUserAgent: { $last: '$userAgent' },
            lastForwardedFor: { $last: '$forwardedFor' },
          },
        },
        { $sort: { count: -1, lastSeen: -1 } },
        { $limit: clampLimit(limit) },
      ])
      .exec();

    return rows.map((row) => ({
      ip: row._id,
      count: row.count,
      distinctNames: row.names.length,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
      reasons: countReasons(row.reasons),
      recentNames: row.names.slice(-5),
      lastUserAgent: row.lastUserAgent,
      lastForwardedFor: row.lastForwardedFor,
    }));
  }

  /** IP 하나의 최근 요청을 새것부터. */
  async listEvents(
    ip: string,
    limit = DEFAULT_LIMIT,
  ): Promise<HopaeDeniedEvent[]> {
    const rows = await this.deniedModel
      .find({ ip: clip(ip) })
      .sort({ createdAt: -1 })
      .limit(clampLimit(limit))
      .select({
        _id: 0,
        name: 1,
        reason: 1,
        userAgent: 1,
        referer: 1,
        forwardedFor: 1,
        createdAt: 1,
      })
      .lean()
      .exec();

    return rows as HopaeDeniedEvent[];
  }
}

function clip(value: string | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_FIELD_LENGTH
    ? trimmed.slice(0, MAX_FIELD_LENGTH)
    : trimmed;
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days < 1) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.floor(days));
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(limit));
}

function countReasons(
  reasons: HopaeDenialReason[],
): Record<HopaeDenialReason, number> {
  const counts: Record<HopaeDenialReason, number> = {
    missing: 0,
    invalid: 0,
    expired: 0,
    mismatch: 0,
  };
  for (const reason of reasons) {
    if (reason in counts) counts[reason] += 1;
  }
  return counts;
}
