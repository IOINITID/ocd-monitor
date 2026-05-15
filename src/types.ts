export type AccentTheme = "orange" | "lavender" | "green" | "blue";

export type ColorTheme = "dark" | "light";

export type HourScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type View = "today" | "stats" | "calendar" | "techniques" | "journal" | "achievements" | "settings";

export type StatRange = "day" | "week" | "month" | "year";

export type EntryType =
  | "obsession_thought"
  | "compulsion_action"
  | "urge"
  | "trigger"
  | "avoidance"
  | "win"
  | "neutral_note";

export type AchievementCategory =
  | "consistency"
  | "compulsion-reduction"
  | "reflection"
  | "resilience"
  | "completion";

export type AchievementDifficulty = "easy" | "medium" | "hard" | "rare" | "epic";

export interface HourEntry {
  id: string;
  date: string;
  hour: number;
  score: HourScore;
  entryType: EntryType;
  tags: string[];
  note?: string;
  xpAwarded: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  startHour: number;
  endHour: number;
  accentTheme: AccentTheme;
  colorTheme: ColorTheme;
  celebrationSoundEnabled: boolean;
  useEmoji: boolean;
}

export interface UserProfile {
  displayName: string;
  focusStatement?: string;
  trackingStartDate?: string;
}

export interface GameState {
  totalXp: number;
  level: number;
  unlockedAchievementIds: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  difficulty?: AchievementDifficulty;
  hidden?: boolean;
  xp: number;
}

export interface DailyNote {
  date: string;
  note: string;
  updatedAt: string;
}

export interface TechniqueUse {
  id: string;
  date: string;
  techniqueId: string;
  durationMinutes?: number;
  createdAt: string;
}

export interface AppData {
  profile: UserProfile;
  settings: AppSettings;
  entries: Record<string, HourEntry>;
  dailyNotes: Record<string, DailyNote>;
  techniqueUses: TechniqueUse[];
  game: GameState;
}

export interface StoredAppData {
  version: 2;
  data: AppData;
}

export interface LegacyStoredAppData {
  version: 1;
  data: {
    settings?: Partial<Omit<AppSettings, "celebrationSoundEnabled">>;
    dailyNotes?: Record<string, DailyNote>;
    techniqueUses?: TechniqueUse[];
    entries?: Record<
      string,
      Omit<HourEntry, "entryType" | "tags"> & {
        entryType?: EntryType;
        tags?: string[];
      }
    >;
    game?: Partial<GameState>;
  };
}

export interface AppMetrics {
  totalEntries: number;
  totalNotes: number;
  uniqueDays: number;
  completedDays: number;
  highScoreEntries: number;
  lowScoreComebacks: number;
  perfectHours: number;
  averageScore: number;
  longestStreak: number;
  currentStreak: number;
}
