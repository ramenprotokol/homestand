import idsFile from "../data/entity-ids.json";
import { THEME_LIBRARY, type EntitySpec, type Theme } from "./library";

export type IdMap = Record<string, { id: string; name: string }>;

export const COMMITTED_IDS: IdMap = idsFile.ids;

/** An entity with the Qloo ID the request will use. */
export interface LiveEntity extends EntitySpec {
  id: string;
}

export interface LiveTheme extends Omit<Theme, "entities"> {
  entities: LiveEntity[];
}

/**
 * The library as the app uses it. Live mode keeps only entities that have a committed ID, and removes a theme left empty.
 * Synthetic mode (local runs and tests) gives every entity a stand-in ID, so the whole library works offline.
 */
export function activeLibrary(ids: IdMap, synthetic: boolean, library: readonly Theme[] = THEME_LIBRARY): LiveTheme[] {
  const out: LiveTheme[] = [];
  for (const t of library) {
    const entities: LiveEntity[] = [];
    for (const spec of t.entities) {
      const id = ids[spec.key]?.id ?? (synthetic ? `SYN-${spec.key}` : null);
      if (id) entities.push({ ...spec, id });
    }
    if (entities.length > 0) out.push({ ...t, entities });
  }
  return out;
}

/** The IDs of every bundle entity of one type, in library order. */
export function idsOfType(library: readonly LiveTheme[], type: EntitySpec["type"]): string[] {
  return library.flatMap((t) => t.entities.filter((x) => x.type === type).map((x) => x.id));
}
