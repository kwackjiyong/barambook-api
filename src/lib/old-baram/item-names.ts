import * as fs from 'node:fs';
import * as path from 'node:path';

export type OldBaramNamesByDye = Record<string, string[]>;
export type OldBaramNamedPart = 'body' | 'weapon' | 'shield';

export interface OldBaramItemNamesDocument {
  version: number;
  source: string;
  parts: Record<OldBaramNamedPart, Record<string, OldBaramNamesByDye>>;
}

function findItemNamesPath(): string {
  const configured = process.env.OLD_BARAM_ITEM_NAMES_PATH;
  const candidates = [
    configured ? path.resolve(configured) : '',
    path.resolve(
      process.cwd(),
      'src',
      'assets',
      'dat',
      'old-baram-item-names.json',
    ),
    path.resolve(
      process.cwd(),
      'dist',
      'assets',
      'dat',
      'old-baram-item-names.json',
    ),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) return found;
  throw new Error(
    `old-baram-item-names.json을 찾을 수 없습니다. 확인한 경로: ${candidates.join(', ')}`,
  );
}

/** 메월 ItemInfo에서 뽑은 avatarId + dye별 아이템 이름과 별칭을 읽는다. */
export function loadOldBaramItemNames(): OldBaramItemNamesDocument {
  const document = JSON.parse(
    fs.readFileSync(findItemNamesPath(), 'utf8'),
  ) as OldBaramItemNamesDocument;

  if (document.version !== 1 || !document.parts) {
    throw new Error('old-baram-item-names.json 형식이 올바르지 않습니다.');
  }
  return document;
}

export function namesOf(
  document: OldBaramItemNamesDocument,
  part: OldBaramNamedPart,
  itemId: number,
): OldBaramNamesByDye | undefined {
  return document.parts[part]?.[String(itemId)];
}
