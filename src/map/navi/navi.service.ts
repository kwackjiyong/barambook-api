import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MapCodeName } from '../code-name/map.schema';
import { MapPortal } from '../portal/map.schema';
import { WorldMap, WorldMapEntry } from '../world-map/map.schema';

type RouteStepType = 'portal' | 'worldMap';

type PortalPoint = {
  x: number;
  y: number;
};

type GraphConnection = {
  c: number;
  p: PortalPoint;
  type: RouteStepType;
};

type PreviousStep = {
  fromCode: number;
  link: GraphConnection;
};

type FindNavigationInput = {
  startName?: string;
  finishName?: string;
};

type NavigationMap = {
  name: string;
};

type NavigationStep = {
  type: RouteStepType;
  fromName: string;
  toName: string;
  portal: PortalPoint;
};

type NavigationResult = {
  found: boolean;
  message?: string;
  start: NavigationMap;
  finish: NavigationMap;
  path: string[];
  steps: NavigationStep[];
  moveCount: number;
  visitedCount: number;
};

type RawWorldMapDocument = WorldMap & {
  entries?: WorldMapEntry[];
  group?: string | number;
  groupId?: string | number;
  worldMapId?: string | number;
  worldMapName?: string | number;
};

const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, '');

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const appendGraphConnection = (
  graph: Map<number, GraphConnection[]>,
  fromCode: number,
  connection: GraphConnection,
) => {
  graph.set(fromCode, [...(graph.get(fromCode) ?? []), connection]);
};

@Injectable()
export class MapNaviService {
  constructor(
    @InjectModel('map_portals', 'barambook')
    private mapPortalModel: Model<MapPortal>,
    @InjectModel('map_code_names', 'barambook')
    private mapCodeNameModel: Model<MapCodeName>,
    @InjectModel('world_map', 'barambook')
    private worldMapModel: Model<WorldMap>,
  ) {}

  async navigate(input: FindNavigationInput): Promise<NavigationResult> {
    const startName = input.startName?.trim();
    const finishName = input.finishName?.trim();

    if (!startName || !finishName) {
      throw new BadRequestException('출발지와 도착지를 입력해주세요.');
    }

    const [portals, codeNames, worldMaps] = await Promise.all([
      this.mapPortalModel.find().lean(),
      this.mapCodeNameModel.find().lean(),
      this.worldMapModel.find().lean(),
    ]);

    const { codeToName, nameToCodes } = this.buildMapIndexes(codeNames);
    const startCodes = nameToCodes.get(normalizeName(startName)) ?? [];
    const finishCodes = nameToCodes.get(normalizeName(finishName)) ?? [];

    const baseResult = {
      start: { name: startName },
      finish: { name: finishName },
    };

    if (startCodes.length === 0 || finishCodes.length === 0) {
      return {
        ...baseResult,
        found: false,
        message: '출발지 또는 도착지 맵을 찾지 못했습니다.',
        path: [],
        steps: [],
        moveCount: 0,
        visitedCount: 0,
      };
    }

    const graph = this.buildGraph(portals, worldMaps, nameToCodes);
    const route = this.findShortestRoute(graph, startCodes, finishCodes);

    if (!route) {
      return {
        ...baseResult,
        found: false,
        message: '이동 가능한 포탈 경로를 찾지 못했습니다.',
        path: [],
        steps: [],
        moveCount: 0,
        visitedCount: 0,
      };
    }

    return {
      ...baseResult,
      found: true,
      path: route.path.map((code) => codeToName.get(code) ?? '이름 없는 맵'),
      steps: route.steps.map((step) => ({
        type: step.type,
        fromName: codeToName.get(step.fromCode) ?? '이름 없는 맵',
        toName: codeToName.get(step.toCode) ?? '이름 없는 맵',
        portal: step.portal,
      })),
      moveCount: route.steps.length,
      visitedCount: route.visitedCount,
    };
  }

  private buildMapIndexes(codeNames: MapCodeName[]) {
    const codeToName = new Map<number, string>();
    const nameToCodes = new Map<string, number[]>();

    codeNames.forEach((map) => {
      const code = toNumber(map.code);
      const name = map.name?.trim();

      if (code === null || !name) {
        return;
      }

      codeToName.set(code, name);
      const key = normalizeName(name);
      nameToCodes.set(key, [...(nameToCodes.get(key) ?? []), code]);
    });

    return { codeToName, nameToCodes };
  }

  private buildGraph(
    portals: MapPortal[],
    worldMaps: WorldMap[],
    nameToCodes: Map<string, number[]>,
  ) {
    const graph = new Map<number, GraphConnection[]>();

    portals.forEach((portal) => {
      const fromCode = toNumber(portal.c);

      if (fromCode === null) {
        return;
      }

      portal.l?.forEach((link) => {
        const toCode = toNumber(link.c);
        const x = toNumber(link.p?.x1);
        const y = toNumber(link.p?.y1);

        if (toCode === null || x === null || y === null) {
          return;
        }

        appendGraphConnection(graph, fromCode, {
          c: toCode,
          p: { x, y },
          type: 'portal',
        });
      });
    });

    this.normalizeWorldMapGroups(worldMaps).forEach((group) => {
      const resolvedEntries = group.flatMap((entry) => {
        const codes = nameToCodes.get(normalizeName(entry.name)) ?? [];
        const x = toNumber(entry.portal?.x);
        const y = toNumber(entry.portal?.y);

        if (x === null || y === null) {
          return [];
        }

        return codes.map((code) => ({
          code,
          portal: { x, y },
        }));
      });

      resolvedEntries.forEach((fromEntry) => {
        resolvedEntries.forEach((toEntry) => {
          if (fromEntry.code === toEntry.code) {
            return;
          }

          appendGraphConnection(graph, fromEntry.code, {
            c: toEntry.code,
            p: fromEntry.portal,
            type: 'worldMap',
          });
        });
      });
    });

    return graph;
  }

  private normalizeWorldMapGroups(worldMaps: WorldMap[]) {
    const groups: WorldMapEntry[][] = [];
    const groupedEntries = new Map<string, WorldMapEntry[]>();

    worldMaps.forEach((worldMap) => {
      const rawWorldMap = worldMap as RawWorldMapDocument;

      if (Array.isArray(rawWorldMap.groups)) {
        rawWorldMap.groups.forEach((group) => {
          if (Array.isArray(group)) {
            groups.push(group);
          }
        });
      }

      [rawWorldMap.l, rawWorldMap.maps, rawWorldMap.entries].forEach(
        (group) => {
          if (Array.isArray(group)) {
            groups.push(group);
          }
        },
      );

      const groupKey =
        rawWorldMap.group ??
        rawWorldMap.groupId ??
        rawWorldMap.worldMapId ??
        rawWorldMap.worldMapName;

      if (rawWorldMap.name && rawWorldMap.portal && groupKey !== undefined) {
        const key = String(groupKey);
        groupedEntries.set(key, [
          ...(groupedEntries.get(key) ?? []),
          { name: rawWorldMap.name, portal: rawWorldMap.portal },
        ]);
      }
    });

    groupedEntries.forEach((group) => groups.push(group));

    return groups;
  }

  private findShortestRoute(
    graph: Map<number, GraphConnection[]>,
    startCodes: number[],
    finishCodes: number[],
  ) {
    const finishCodeSet = new Set(finishCodes);
    const startCodeSet = new Set(startCodes);
    const firstFinishedStartCode = startCodes.find((code) =>
      finishCodeSet.has(code),
    );

    if (firstFinishedStartCode !== undefined) {
      return {
        path: [firstFinishedStartCode],
        steps: [] as Array<{
          fromCode: number;
          toCode: number;
          portal: PortalPoint;
          type: RouteStepType;
        }>,
        visitedCount: startCodeSet.size,
      };
    }

    const queue = [...startCodeSet];
    const visited = new Set(queue);
    const previous = new Map<number, PreviousStep>();
    let cursor = 0;

    while (cursor < queue.length) {
      const currentCode = queue[cursor];
      cursor += 1;

      const links = graph.get(currentCode) ?? [];

      for (const link of links) {
        const nextCode = toNumber(link.c);

        if (nextCode === null || visited.has(nextCode)) {
          continue;
        }

        visited.add(nextCode);
        previous.set(nextCode, { fromCode: currentCode, link });

        if (finishCodeSet.has(nextCode)) {
          return this.restoreRoute(nextCode, startCodeSet, previous, visited);
        }

        queue.push(nextCode);
      }
    }

    return null;
  }

  private restoreRoute(
    finishCode: number,
    startCodeSet: Set<number>,
    previous: Map<number, PreviousStep>,
    visited: Set<number>,
  ) {
    const path = [finishCode];
    const steps: Array<{
      fromCode: number;
      toCode: number;
      portal: PortalPoint;
      type: RouteStepType;
    }> = [];
    let traceCode = finishCode;

    while (!startCodeSet.has(traceCode)) {
      const previousStep = previous.get(traceCode);

      if (!previousStep) {
        return null;
      }

      path.push(previousStep.fromCode);
      steps.push({
        fromCode: previousStep.fromCode,
        toCode: traceCode,
        portal: previousStep.link.p,
        type: previousStep.link.type,
      });
      traceCode = previousStep.fromCode;
    }

    return {
      path: path.reverse(),
      steps: steps.reverse(),
      visitedCount: visited.size,
    };
  }
}
