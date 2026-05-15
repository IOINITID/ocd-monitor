import { achievements, levelFromXp } from "./data";
import type { AppData, AppMetrics, EntryType, HourEntry, HourScore } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayKey = () => toDateKey(new Date());

export const formatHour = (hour: number) => `${`${hour}`.padStart(2, "0")}:00`;

export const getHoursRange = (startHour: number, endHour: number) => {
  const safeStart = Math.max(0, Math.min(23, startHour));
  const safeEnd = Math.max(safeStart + 1, Math.min(24, endHour));
  return Array.from({ length: safeEnd - safeStart }, (_, index) => safeStart + index);
};

export const getScoreTone = (score?: number) => {
  if (!score) {
    return "empty";
  }

  if (score <= 3) {
    return "low";
  }

  if (score <= 6) {
    return "mid";
  }

  if (score <= 8) {
    return "good";
  }

  return "great";
};

export const clampScore = (value: number): HourScore =>
  Math.max(1, Math.min(10, Math.round(value))) as HourScore;

export const getEntries = (data: AppData) =>
  Object.values(data.entries).sort((entryA, entryB) => {
    if (entryA.date === entryB.date) {
      return entryA.hour - entryB.hour;
    }

    return entryA.date.localeCompare(entryB.date);
  });

export const getEntriesForDate = (data: AppData, date: string) =>
  getEntries(data).filter((entry) => entry.date === date);

export const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const getDateOffset = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

export const getWeekDates = (anchor: Date) => {
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 7 }, (_, index) => toDateKey(getDateOffset(anchor, mondayOffset + index)));
};

export const getMonthDates = (anchor: Date) => {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, index) => toDateKey(new Date(year, month, index + 1)));
};

export const getYearMonths = (anchor: Date) =>
  Array.from({ length: 12 }, (_, index) => {
    const month = `${index + 1}`.padStart(2, "0");
    return `${anchor.getFullYear()}-${month}`;
  });

const getUniqueDates = (entries: HourEntry[]) => [...new Set(entries.map((entry) => entry.date))].sort();

export const isCompletedDay = (data: AppData, date: string) => {
  const expectedHours = getHoursRange(data.settings.startHour, data.settings.endHour).length;
  const entries = getEntriesForDate(data, date);
  return expectedHours > 0 && entries.length >= expectedHours;
};

const getLongestStreak = (dateKeys: string[]) => {
  if (dateKeys.length === 0) {
    return 0;
  }

  let longest = 1;
  let current = 1;

  for (let index = 1; index < dateKeys.length; index += 1) {
    const previous = new Date(`${dateKeys[index - 1]}T00:00:00`);
    const currentDate = new Date(`${dateKeys[index]}T00:00:00`);
    const diff = Math.round((currentDate.getTime() - previous.getTime()) / dayMs);

    if (diff === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
};

const getCurrentStreak = (dateKeys: string[]) => {
  if (dateKeys.length === 0) {
    return 0;
  }

  const dateSet = new Set(dateKeys);
  let streak = 0;
  let cursor = new Date();

  while (dateSet.has(toDateKey(cursor))) {
    streak += 1;
    cursor = getDateOffset(cursor, -1);
  }

  return streak;
};

const getLowScoreComebacks = (entries: HourEntry[]) => {
  let count = 0;

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const current = entries[index];
    const sameDay = previous.date === current.date;

    if (sameDay && previous.score <= 3 && current.score > previous.score) {
      count += 1;
    }
  }

  return count;
};

export const getMetrics = (data: AppData): AppMetrics => {
  const entries = getEntries(data);
  const uniqueDates = getUniqueDates(entries);
  const completedDays = uniqueDates.filter((date) => isCompletedDay(data, date)).length;

  return {
    totalEntries: entries.length,
    totalNotes: entries.filter((entry) => Boolean(entry.note)).length,
    uniqueDays: uniqueDates.length,
    completedDays,
    highScoreEntries: entries.filter((entry) => entry.score >= 8).length,
    lowScoreComebacks: getLowScoreComebacks(entries),
    perfectHours: entries.filter((entry) => entry.score === 10).length,
    averageScore: average(entries.map((entry) => entry.score)),
    longestStreak: getLongestStreak(uniqueDates),
    currentStreak: getCurrentStreak(uniqueDates)
  };
};

const incrementCounter = <T extends string>(counter: Record<T, number>, key: T) => {
  counter[key] = (counter[key] ?? 0) + 1;
};

export const getEntryTypeSummary = (entries: HourEntry[]) => {
  const counter = {} as Record<EntryType, number>;

  entries.forEach((entry) => incrementCounter(counter, entry.entryType));

  return Object.entries(counter)
    .map(([type, count]) => ({ type: type as EntryType, count }))
    .sort((left, right) => right.count - left.count);
};

export const getTagSummary = (entries: HourEntry[]) => {
  const counter: Record<string, number> = {};

  entries.forEach((entry) => {
    entry.tags.forEach((tag) => {
      counter[tag] = (counter[tag] ?? 0) + 1;
    });
  });

  return Object.entries(counter)
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
};

export const getUnlockedAchievementIds = (data: AppData) => {
  const entries = getEntries(data);
  const metrics = getMetrics(data);
  const today = todayKey();
  const todayEntries = getEntriesForDate(data, today);
  const unlocked = new Set<string>();
  const hasEntry = (predicate: (entry: HourEntry) => boolean) => entries.some(predicate);
  const maxGoodRun = entries.reduce(
    (state, entry) => {
      const nextRun = entry.score >= 7 ? state.current + 1 : 0;
      return {
        current: nextRun,
        best: Math.max(state.best, nextRun)
      };
    },
    { current: 0, best: 0 }
  ).best;

  const addIf = (id: string, condition: boolean) => {
    if (condition) {
      unlocked.add(id);
    }
  };

  addIf("first-signal", metrics.totalEntries >= 1);
  addIf("three-checks", todayEntries.length >= 3);
  addIf("five-checks", todayEntries.length >= 5);
  addIf("full-window", isCompletedDay(data, today) || metrics.completedDays >= 1);
  addIf("two-full-days", metrics.completedDays >= 2);
  addIf("week-streak", metrics.longestStreak >= 7);
  addIf("two-week-streak", metrics.longestStreak >= 14);
  addIf("month-streak", metrics.longestStreak >= 30);
  addIf("first-note", metrics.totalNotes >= 1);
  addIf("ten-notes", metrics.totalNotes >= 10);
  addIf("twenty-notes", metrics.totalNotes >= 20);
  addIf("fifty-notes", metrics.totalNotes >= 50);
  addIf("score-eight", hasEntry((entry) => entry.score >= 8));
  addIf("score-nine", hasEntry((entry) => entry.score >= 9));
  addIf("score-ten", hasEntry((entry) => entry.score === 10));
  addIf("five-high", metrics.highScoreEntries >= 5);
  addIf("twenty-high", metrics.highScoreEntries >= 20);
  addIf("fifty-high", metrics.highScoreEntries >= 50);
  addIf("ten-perfect", metrics.perfectHours >= 10);
  addIf("comeback-one", metrics.lowScoreComebacks >= 1);
  addIf("comeback-five", metrics.lowScoreComebacks >= 5);
  addIf("difficult-hour-logged", hasEntry((entry) => entry.score <= 3));
  addIf("ten-difficult-logged", entries.filter((entry) => entry.score <= 3).length >= 10);
  addIf("hundred-entries", metrics.totalEntries >= 100);
  addIf("two-hundred-entries", metrics.totalEntries >= 200);
  addIf("first-week-complete", metrics.uniqueDays >= 5);
  addIf("average-six", metrics.averageScore >= 6);
  addIf("average-seven", metrics.averageScore >= 7);
  addIf("average-eight", metrics.averageScore >= 8);
  addIf("morning-check", hasEntry((entry) => entry.hour < 12));
  addIf("evening-check", hasEntry((entry) => entry.hour >= 20));
  addIf("same-day-return", todayEntries.length >= 2);
  addIf("weekend-care", hasEntry((entry) => [0, 6].includes(new Date(`${entry.date}T00:00:00`).getDay())));
  addIf("gentle-low-note", hasEntry((entry) => entry.score <= 3 && Boolean(entry.note)));
  addIf("no-perfect-needed", todayEntries.length >= 3 && new Set(todayEntries.map((entry) => entry.score)).size >= 2);
  addIf("three-day-complete", metrics.completedDays >= 3);
  addIf("five-day-complete", metrics.completedDays >= 5);
  addIf("ten-day-complete", metrics.completedDays >= 10);
  addIf("first-level-up", data.game.level >= 2);
  addIf("level-ten", data.game.level >= 10);
  addIf("level-twenty-five", data.game.level >= 25);
  addIf("level-fifty", data.game.level >= 50);
  addIf("level-hundred", data.game.level >= 100);
  addIf("balanced-day", todayEntries.length >= 3 && average(todayEntries.map((entry) => entry.score)) >= 5 && average(todayEntries.map((entry) => entry.score)) <= 8);
  addIf("three-good-in-row", maxGoodRun >= 3);
  addIf("five-good-in-row", maxGoodRun >= 5);
  addIf("ten-days-any", metrics.uniqueDays >= 10);
  addIf("thirty-days-any", metrics.uniqueDays >= 30);
  addIf("fifty-days-any", metrics.uniqueDays >= 50);
  addIf("all-achievement-preview", metrics.totalEntries >= 1);

  return achievements.filter((achievement) => unlocked.has(achievement.id)).map((achievement) => achievement.id);
};

export const reconcileGameState = (data: AppData): AppData => {
  const firstPassUnlockedAchievementIds = getUnlockedAchievementIds(data);
  const entryXp = Object.values(data.entries).reduce((sum, entry) => sum + entry.xpAwarded, 0);
  const firstPassAchievementXp = achievements
    .filter((achievement) => firstPassUnlockedAchievementIds.includes(achievement.id))
    .reduce((sum, achievement) => sum + achievement.xp, 0);
  const firstPassTotalXp = entryXp + firstPassAchievementXp;
  const secondPassData: AppData = {
    ...data,
    game: {
      totalXp: firstPassTotalXp,
      level: levelFromXp(firstPassTotalXp),
      unlockedAchievementIds: firstPassUnlockedAchievementIds
    }
  };
  const unlockedAchievementIds = getUnlockedAchievementIds(secondPassData);
  const achievementXp = achievements
    .filter((achievement) => unlockedAchievementIds.includes(achievement.id))
    .reduce((sum, achievement) => sum + achievement.xp, 0);
  const totalXp = entryXp + achievementXp;

  return {
    ...data,
    game: {
      totalXp,
      level: levelFromXp(totalXp),
      unlockedAchievementIds
    }
  };
};

export const getStatDates = (range: "day" | "week" | "month" | "year", anchor: Date) => {
  if (range === "day") {
    return [toDateKey(anchor)];
  }

  if (range === "week") {
    return getWeekDates(anchor);
  }

  if (range === "month") {
    return getMonthDates(anchor);
  }

  return getYearMonths(anchor);
};
