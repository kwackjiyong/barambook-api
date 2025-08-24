import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MapPortal } from '../portal/map.schema';

@Injectable()
export class MapNaviService {
  constructor(
    @InjectModel('map_portals', 'barambook')
    private mapPortalModel: Model<MapPortal>,
  ) {}
  findMapPortals(): Promise<MapPortal[]> {
    const allPortalList = this.mapPortalModel.find();
    return allPortalList;
  }
  async navigate(): Promise<number[]> {
    const allPortalList = await this.mapPortalModel.find();
    type Portal = {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

    type Connection = {
      c: number; // 연결된 맵의 ID
      p: Portal; // 포탈 위치 정보
    };

    type MapData = {
      _id: string;
      c: number; // 현재 맵의 ID
      l: Connection[]; // 연결된 포탈 정보 리스트
    };

    // 샘플 데이터
    const mapData: MapPortal[] = allPortalList;

    /**
     * 게임 맵 데이터를 기반으로 그래프 생성
     */
    const buildGraph = (maps: MapData[]): Map<number, Connection[]> => {
      const graph = new Map<number, Connection[]>();
      maps.forEach(({ c, l }) => {
        graph.set(c, l);
      });
      return graph;
    };

    /**
     * BFS를 사용한 최단 경로 탐색
     * @param graph - 맵의 포탈 연결 정보를 담은 그래프
     * @param start - 시작 맵 ID
     * @param target - 목표 맵 ID
     * @returns 이동 경로 리스트 (포탈 정보 포함)
     */
    const findShortestPath = (
      graph: Map<number, Connection[]>,
      start: number,
      target: number,
    ): { path: number[]; portals: Portal[] } | null => {
      if (start === target) return { path: [start], portals: [] };
      const queue: { map: number; path: number[]; portals: Portal[] }[] = [
        { map: start, path: [start], portals: [] },
      ];
      const visited = new Set<number>([start]);
      while (queue.length > 0) {
        const { map, path, portals } = queue.shift()!;
        const neighbors = graph.get(map) || [];
        for (const { c, p } of neighbors) {
          if (!visited.has(c)) {
            const newPath = [...path, c];
            const newPortals = [...portals, p];
            if (c === target) {
              return { path: newPath, portals: newPortals };
            }
            queue.push({ map: c, path: newPath, portals: newPortals });
            visited.add(c);
          }
        }
      }
      return null; // 경로 없음
    };
    // 그래프 생성
    const graph = buildGraph(mapData);
    // 경로 탐색 테스트
    const startMap = 2;
    const targetMap = 7777;
    const result = findShortestPath(graph, startMap, targetMap);

    return result?.path ?? [];
  }
}
