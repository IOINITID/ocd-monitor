import { achievements, levelFromXp } from "./data";
import { idbDelete, idbGet, idbPut } from "./db";
import type {
  AppData,
  AppSettings,
  EntryType,
  GameState,
  DailyNote,
  HourEntry,
  LegacyStoredAppData,
  StoredAppData,
  TechniqueUse,
  UserProfile
} from "./types";

const STORAGE_KEY = "data:v1";
const LEGACY_LOCAL_STORAGE_KEY = "ocd-monitor:data:v1";
export const STORAGE_SCHEMA_VERSION = 2;

const defaultSettings: AppSettings = {
  startHour: 9,
  endHour: 23,
  accentTheme: "orange",
  colorTheme: "light",
  celebrationSoundEnabled: false,
  useEmoji: false
};

const defaultProfile: UserProfile = {
  displayName: "",
  focusStatement: "",
  trackingStartDate: ""
};

const defaultGame: GameState = {
  totalXp: 0,
  level: 1,
  unlockedAchievementIds: []
};

export const createDefaultData = (): AppData => ({
  profile: defaultProfile,
  settings: defaultSettings,
  entries: {},
  dailyNotes: {},
  techniqueUses: [],
  game: defaultGame
});

const isStoredAppData = (value: unknown): value is StoredAppData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeData = value as Partial<StoredAppData>;
  return maybeData.version === STORAGE_SCHEMA_VERSION && typeof maybeData.data === "object";
};

const isLegacyStoredAppData = (value: unknown): value is LegacyStoredAppData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeData = value as Partial<LegacyStoredAppData>;
  return maybeData.version === 1 && typeof maybeData.data === "object";
};

const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [...new Set(tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))];
};

const normalizeEntryType = (entryType: unknown): EntryType => {
  const allowedTypes: EntryType[] = [
    "obsession_thought",
    "compulsion_action",
    "urge",
    "trigger",
    "avoidance",
    "win",
    "neutral_note"
  ];

  return allowedTypes.includes(entryType as EntryType) ? (entryType as EntryType) : "neutral_note";
};

const migrateEntries = (entries: LegacyStoredAppData["data"]["entries"] | StoredAppData["data"]["entries"] = {}) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [
      key,
      {
        ...entry,
        entryType: normalizeEntryType(entry.entryType),
        tags: normalizeTags(entry.tags)
      }
    ])
  );

const isDailyNote = (note: unknown): note is DailyNote => {
  if (!note || typeof note !== "object") {
    return false;
  }

  const maybeNote = note as Partial<DailyNote>;
  return typeof maybeNote.date === "string" && typeof maybeNote.note === "string" && typeof maybeNote.updatedAt === "string";
};

const migrateDailyNotes = (dailyNotes: HydratableAppData["dailyNotes"] = {}) =>
  Object.fromEntries(Object.entries(dailyNotes).filter(([, note]) => isDailyNote(note)));

const isTechniqueUse = (use: unknown): use is TechniqueUse => {
  if (!use || typeof use !== "object") {
    return false;
  }

  const maybeUse = use as Partial<TechniqueUse>;
  return (
    typeof maybeUse.id === "string" &&
    typeof maybeUse.date === "string" &&
    typeof maybeUse.techniqueId === "string" &&
    typeof maybeUse.createdAt === "string"
  );
};

const migrateTechniqueUses = (techniqueUses: HydratableAppData["techniqueUses"] = []) =>
  Array.isArray(techniqueUses) ? techniqueUses.filter(isTechniqueUse) : [];

type HydratableAppData = {
  profile?: Partial<UserProfile>;
  settings?: Partial<AppSettings>;
  entries?: LegacyStoredAppData["data"]["entries"] | StoredAppData["data"]["entries"];
  dailyNotes?: Record<string, DailyNote>;
  techniqueUses?: TechniqueUse[];
  game?: Partial<GameState>;
};

const finalizeData = (data: HydratableAppData): AppData => {
  const totalXp = data.game?.totalXp ?? 0;

  return {
    profile: {
      ...defaultProfile,
      ...data.profile
    },
    settings: {
      ...defaultSettings,
      ...data.settings
    },
    entries: migrateEntries(data.entries),
    dailyNotes: migrateDailyNotes(data.dailyNotes),
    techniqueUses: migrateTechniqueUses(data.techniqueUses),
    game: {
      ...defaultGame,
      ...data.game,
      level: levelFromXp(totalXp),
      unlockedAchievementIds: data.game?.unlockedAchievementIds ?? []
    }
  };
};

const parseStored = (raw: unknown): AppData | null => {
  if (isStoredAppData(raw)) {
    return finalizeData(raw.data);
  }

  if (isLegacyStoredAppData(raw)) {
    return finalizeData(raw.data);
  }

  return null;
};

const migrateFromLocalStorage = async (): Promise<AppData | null> => {
  if (typeof localStorage === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const data = parseStored(parsed);

    if (!data) {
      return null;
    }

    // Перенесли в IDB → можно убрать из localStorage,
    // но только после успешной записи, чтобы не потерять при сбое.
    await idbPut(STORAGE_KEY, parsed);
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    return data;
  } catch {
    return null;
  }
};

export const loadAppData = async (): Promise<AppData> => {
  try {
    const stored = await idbGet<unknown>(STORAGE_KEY);
    const parsed = parseStored(stored);

    if (parsed) {
      return parsed;
    }

    const migrated = await migrateFromLocalStorage();

    if (migrated) {
      return migrated;
    }

    return createDefaultData();
  } catch {
    return createDefaultData();
  }
};

export const saveAppData = async (data: AppData): Promise<void> => {
  const payload: StoredAppData = {
    version: STORAGE_SCHEMA_VERSION,
    data
  };

  try {
    await idbPut(STORAGE_KEY, payload);
  } catch {
    // Если IDB недоступна (private mode и т.п.) — данные останутся только в памяти.
  }
};

export const clearAppData = async (): Promise<void> => {
  try {
    await idbDelete(STORAGE_KEY);
  } catch {
    // Игнорируем — пользователь всё равно увидит чистый state после reload.
  }

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  }
};

export const getEntryKey = (date: string, hour: number) => `${date}-${hour}`;

const entriesToMap = (entries: unknown): HydratableAppData["entries"] => {
  if (!entries) {
    return {};
  }

  // Экспорт сохраняет entries как массив, в IDB они хранятся как объект-словарь.
  if (Array.isArray(entries)) {
    const map: Record<string, HourEntry> = {};
    entries.forEach((entry) => {
      if (entry && typeof entry === "object" && "date" in entry && "hour" in entry) {
        const typedEntry = entry as HourEntry;
        map[getEntryKey(typedEntry.date, typedEntry.hour)] = typedEntry;
      }
    });
    return map;
  }

  if (typeof entries === "object") {
    return entries as HydratableAppData["entries"];
  }

  return {};
};

/** Принимает payload экспорта (или StoredAppData wrapper) и возвращает валидный AppData. */
export const importAppData = (raw: unknown): AppData | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const payload = raw as Record<string, unknown>;
  // Поддерживаем два формата: { version, data: {...} } и плоский export.
  const source = (payload.data && typeof payload.data === "object")
    ? (payload.data as Record<string, unknown>)
    : payload;

  if (!source || typeof source !== "object") {
    return null;
  }

  try {
    return finalizeData({
      profile: source.profile as HydratableAppData["profile"],
      settings: source.settings as HydratableAppData["settings"],
      entries: entriesToMap(source.entries),
      dailyNotes: source.dailyNotes as HydratableAppData["dailyNotes"],
      techniqueUses: source.techniqueUses as HydratableAppData["techniqueUses"],
      game: source.game as HydratableAppData["game"]
    });
  } catch {
    return null;
  }
};

export const calculateEntryXp = (score: number, hasNote: boolean) => {
  const baseXp = 14;
  const scoreXp = Math.round(score * 3.5);
  const reflectionXp = hasNote ? 8 : 0;
  return baseXp + scoreXp + reflectionXp;
};

export const createEntry = (
  date: string,
  hour: number,
  score: HourEntry["score"],
  note: string,
  entryType: EntryType,
  tags: string[],
  existingEntry?: HourEntry
): HourEntry => {
  const now = new Date().toISOString();
  const trimmedNote = note.trim();
  const xpAwarded =
    existingEntry?.xpAwarded ?? calculateEntryXp(score, trimmedNote.length > 0);

  return {
    id: existingEntry?.id ?? `${date}-${hour}-${now}`,
    date,
    hour,
    score,
    entryType,
    tags: normalizeTags(tags),
    note: trimmedNote || undefined,
    xpAwarded,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now
  };
};

export const getAchievementXp = (achievementIds: string[]) =>
  achievements
    .filter((achievement) => achievementIds.includes(achievement.id))
    .reduce((sum, achievement) => sum + achievement.xp, 0);
