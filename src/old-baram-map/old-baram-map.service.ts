import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder } from 'mongoose';
import { oldBaramMinimapUrl } from '../common/old-baram-assets';
import { QueryOldBaramMapsDto } from './dto/query-old-baram-maps.dto';
import { OldBaramMap } from './old-baram-map.schema';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type MapDocument = Partial<OldBaramMap> & {
  mapId: number;
  hasMinimap: boolean;
};

function decorate<T extends MapDocument>(map: T) {
  return {
    ...map,
    minimapUrl: map.hasMinimap ? oldBaramMinimapUrl(map.mapId) : null,
  };
}

@Injectable()
export class OldBaramMapService {
  constructor(
    @InjectModel('old_baram_maps', 'barambook')
    private readonly mapModel: Model<OldBaramMap>,
  ) {}

  async findAll(query: QueryOldBaramMapsDto) {
    const filter: FilterQuery<OldBaramMap> = {};
    if (!query.includeDisabled) filter.disabled = false;
    if (query.keyword) filter.keyword = query.keyword;
    if (query.parentMapId !== undefined) filter.parentMapId = query.parentMapId;
    if (query.hasMinimap) filter.hasMinimap = true;
    if (query.hasMob) filter.mobCount = { $gt: 0 };

    if (query.search) {
      const exactId = /^\d+$/.test(query.search) ? Number(query.search) : null;
      filter.$or = [
        { name: { $regex: escapeRegExp(query.search), $options: 'i' } },
        { keyword: { $regex: escapeRegExp(query.search), $options: 'i' } },
        ...(exactId !== null ? [{ mapId: exactId }] : []),
      ];
    }

    const sorts: Record<
      QueryOldBaramMapsDto['sort'],
      Record<string, SortOrder>
    > = {
      id: { mapId: 1 },
      name: { name: 1, mapId: 1 },
      mob: { mobCount: -1, mapId: 1 },
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.mapModel
        .find(filter)
        .sort(sorts[query.sort])
        .skip(skip)
        .limit(query.limit)
        .select({
          _id: 0,
          mapId: 1,
          name: 1,
          keyword: 1,
          parentMapId: 1,
          parentName: 1,
          portalCount: 1,
          mobCount: 1,
          hasMinimap: 1,
          minimapWidth: 1,
          minimapHeight: 1,
          worldMapName: 1,
          disabled: 1,
        })
        .lean()
        .exec(),
      this.mapModel.countDocuments(filter).exec(),
    ]);

    return {
      maps: rows.map((map) => decorate(map as unknown as MapDocument)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  async findOne(mapId: number) {
    const map = await this.mapModel
      .findOne({ mapId })
      .select({ _id: 0 })
      .lean()
      .exec();
    if (!map) throw new NotFoundException('옛날바람 지도를 찾을 수 없습니다.');

    // 이 지도로 들어오는 포탈도 같이 보여 준다.
    const incoming = await this.mapModel
      .find({ 'portals.toMapId': mapId, disabled: false })
      .select({ _id: 0, mapId: 1, name: 1 })
      .limit(60)
      .lean()
      .exec();

    return {
      ...decorate(map as unknown as MapDocument),
      incomingPortals: incoming,
    };
  }

  // 키워드(던전·지역) 목록. 지도 탐색의 1차 진입점이다.
  async getKeywords() {
    const rows = await this.mapModel
      .aggregate<{ _id: string; count: number; minimaps: number }>([
        { $match: { disabled: false, keyword: { $nin: [null, ''] } } },
        {
          $group: {
            _id: '$keyword',
            count: { $sum: 1 },
            minimaps: { $sum: { $cond: ['$hasMinimap', 1, 0] } },
          },
        },
        { $sort: { count: -1, _id: 1 } },
      ])
      .exec();
    return rows.map((row) => ({
      keyword: row._id,
      count: row.count,
      minimaps: row.minimaps,
    }));
  }

  async getMetadata() {
    const [total, withMinimap, withMob, disabled, keywords] = await Promise.all(
      [
        this.mapModel.countDocuments({ disabled: false }).exec(),
        this.mapModel
          .countDocuments({ disabled: false, hasMinimap: true })
          .exec(),
        this.mapModel
          .countDocuments({ disabled: false, mobCount: { $gt: 0 } })
          .exec(),
        this.mapModel.countDocuments({ disabled: true }).exec(),
        this.getKeywords(),
      ],
    );
    return { total, withMinimap, withMob, disabled, keywords };
  }
}
