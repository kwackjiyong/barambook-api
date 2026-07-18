export interface GradeDefinition {
  point: number;
  id: number;
  name: string;
  isMaster?: boolean;
}

export interface MemberGrade extends GradeDefinition {
  isMaster: boolean;
}

// barambook-data/data/json/grade.json을 서비스 런타임에서 사용하는 등급 기준으로 옮긴다.
// 일반 등급은 최소 필요 포인트 오름차순이며, isMaster 등급은 운영자에게만 적용한다.
export const GRADES: readonly GradeDefinition[] = [
  { point: 0, id: 212, name: '뼈다귀' },
  { point: 500, id: 1009, name: '황호박단추' },
  { point: 1000, id: 1010, name: '적호박단추' },
  { point: 2000, id: 1011, name: '연녹호박단추' },
  { point: 3000, id: 1012, name: '녹호박단추' },
  { point: 4000, id: 1013, name: '청호박단추' },
  { point: 5000, id: 1014, name: '회호박단추' },
  { point: 6000, id: 1015, name: '자호박단추' },
  { point: 7000, id: 1018, name: '연자호박단추' },
  { point: 8000, id: 1019, name: '연청호박단추' },
  { point: 9000, id: 1020, name: '황금호박단추' },
  { point: 20000, id: 1021, name: '황호박결정' },
  { point: 22000, id: 1022, name: '적호박결정' },
  { point: 24000, id: 1023, name: '연녹호박결정' },
  { point: 26000, id: 1024, name: '녹호박결정' },
  { point: 28000, id: 1025, name: '청호박결정' },
  { point: 30000, id: 1026, name: '회호박결정' },
  { point: 32000, id: 1027, name: '갈호박결정' },
  { point: 34000, id: 1028, name: '연갈호박결정' },
  { point: 36000, id: 1029, name: '연자호박결정' },
  { point: 38000, id: 1030, name: '자호박결정' },
  { point: 40000, id: 1031, name: '연청호박결정' },
  { point: 42000, id: 1032, name: '황금호박결정' },
  { point: 50000, id: 1033, name: '황호박보석' },
  { point: 55000, id: 1034, name: '적호박보석' },
  { point: 60000, id: 1035, name: '연녹호박보석' },
  { point: 65000, id: 1036, name: '녹호박보석' },
  { point: 70000, id: 1037, name: '청호박보석' },
  { point: 75000, id: 1038, name: '연갈호박보석' },
  { point: 80000, id: 1039, name: '연자호박보석' },
  { point: 85000, id: 1043, name: '연청호박보석' },
  { point: 90000, id: 1044, name: '황금호박보석' },
  { point: 100000, id: 1081, name: '황호박별' },
  { point: 150000, id: 1082, name: '적호박별' },
  { point: 200000, id: 1083, name: '연녹호박별' },
  { point: 250000, id: 1084, name: '녹호박별' },
  { point: 300000, id: 1085, name: '청호박별' },
  { point: 350000, id: 1086, name: '회호박별' },
  { point: 400000, id: 1087, name: '갈호박별' },
  { point: 450000, id: 1091, name: '연청호박별' },
  { point: 500000, id: 1092, name: '황금호박별' },
  { point: 700000, id: 1222, name: '통투구' },
  { point: 800000, id: 1223, name: '신장투구' },
  { point: 1000000, id: 1224, name: '외각투구' },
  { point: 1300000, id: 1225, name: '비룡투구' },
  { point: 1700000, id: 1226, name: '황금투구' },
  { point: 2000000, id: 1227, name: '쇄자황금투구' },
  { point: 3000000, id: 1230, name: '주작투구' },
  { point: 4000000, id: 1228, name: '백호투구' },
  { point: 5000000, id: 1229, name: '현무투구' },
  { point: 7000000, id: 1231, name: '청룡투구' },
  { isMaster: true, point: 0, id: 2309, name: '두목의증표' },
] as const;

const MASTER_GRADE = GRADES.find((grade) => grade.isMaster === true);
const POINT_GRADES = GRADES.filter((grade) => grade.isMaster !== true);

export function resolveGrade(point: number, isOperator = false): MemberGrade {
  if (isOperator && MASTER_GRADE) {
    return { ...MASTER_GRADE, isMaster: true };
  }

  const normalizedPoint = Math.max(0, Math.floor(Number(point) || 0));
  let current = POINT_GRADES[0];

  for (const grade of POINT_GRADES) {
    if (grade.point > normalizedPoint) {
      break;
    }
    current = grade;
  }

  return {
    ...(current ?? { point: 0, id: 212, name: '뼈다귀' }),
    isMaster: false,
  };
}
