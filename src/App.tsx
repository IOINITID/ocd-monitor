import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { achievements, accentThemes, builtInTags, entryTypeMeta, entryTypeOrder, getLevelName, xpProgress } from "./data";
import {
  calculateEntryXp,
  clearAppData,
  createDefaultData,
  createEntry,
  getEntryKey,
  importAppData,
  loadAppData,
  saveAppData,
  STORAGE_SCHEMA_VERSION
} from "./storage";
import type {
  AccentTheme,
  Achievement,
  AchievementDifficulty,
  AppData,
  ColorTheme,
  EntryType,
  HourEntry,
  HourScore,
  StatRange,
  UserProfile,
  View
} from "./types";
import {
  average,
  clampScore,
  formatHour,
  getEntries,
  getEntriesForDate,
  getEntryTypeSummary,
  getHoursRange,
  getMetrics,
  getMonthDates,
  getScoreTone,
  getTagSummary,
  getWeekDates,
  getYearMonths,
  reconcileGameState,
  todayKey,
  toDateKey
} from "./utils";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const navItems: Array<{ id: View; label: string; prefix: string }> = [
  { id: "today", label: "Сегодня", prefix: "01" },
  { id: "stats", label: "Статистика", prefix: "02" },
  { id: "calendar", label: "Календарь", prefix: "03" },
  { id: "techniques", label: "Техники", prefix: "04" },
  { id: "journal", label: "Журнал", prefix: "05" }
];

const navMetaItems: Array<{ id: View; label: string; prefix: string }> = [
  { id: "achievements", label: "Достижения", prefix: "06" },
  { id: "settings", label: "Настройки", prefix: "07" }
];

const statRangeLabels: Record<StatRange, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год"
};

type AchievementFilter = "all" | "unlocked" | "hidden" | AchievementDifficulty;

const achievementFilterLabels: Record<AchievementFilter, string> = {
  all: "Все",
  unlocked: "Открытые",
  hidden: "Скрытые",
  easy: "Легкие",
  medium: "Средние",
  hard: "Сложные",
  rare: "Редкие",
  epic: "Эпические"
};

const achievementDifficultyLabels: Record<AchievementDifficulty, string> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  rare: "rare",
  epic: "epic"
};

const getAchievementDifficulty = (achievement: Achievement): AchievementDifficulty => achievement.difficulty ?? "easy";

const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthLabels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const scoreLabels: Record<HourScore, string> = {
  1: "очень трудно",
  2: "трудно",
  3: "много напряжения",
  4: "немного держался",
  5: "смешанный час",
  6: "уже устойчивее",
  7: "хороший курс",
  8: "меньше ритуалов",
  9: "очень ровно",
  10: "звездный час"
};

const normalizeTag = (tag: string) => tag.trim().replace(/\s+/g, " ").slice(0, 28);

const isDetailedScore = (score: HourScore) => score <= 6;

const hasStructuredDetails = (entryType: EntryType, tags: string[]) => entryType !== "neutral_note" || tags.length > 0;

const getTerminalCommand = (hour: number | null, entryType: EntryType) =>
  `ocd-monitor@local:${hour === null ? "--:--" : formatHour(hour)} $ note --type ${entryType}`;

const getNotePlaceholder = (score: HourScore) =>
  isDetailedScore(score)
    ? "Коротко: что появилось, что хотелось сделать, какой следующий мягкий шаг?"
    : "Коротко: как прошел час и что помогло держаться курса?";

const getTerminalHint = (score: HourScore, entryType: EntryType) =>
  isDetailedScore(score)
    ? `Сложный час: можно выбрать тип, теги и оставить короткую заметку без долгого разбора. Сейчас: ${entryTypeMeta[entryType].label}.`
    : "Хороший час: достаточно короткой заметки. Детали можно раскрыть, если хочется сохранить контекст.";

const techniqueCards = [
  {
    id: "urge-delay",
    title: "Отложить компульсию",
    command: "urge -> wait 5m -> reassess",
    body: "Поставь короткий таймер и до его окончания не выполняй ритуал. Часто желание становится слабее."
  },
  {
    id: "breathing",
    title: "Дыхание 4-7-8",
    command: "inhale 4s / hold 7s / exhale 8s",
    body: "Повтори 4 цикла. Это не проверка состояния, а способ снизить общий уровень возбуждения."
  },
  {
    id: "grounding",
    title: "Заземление 5-4-3-2-1",
    command: "5 vision / 4 sound / 3 touch / 2 smell / 1 taste",
    body: "Верни внимание в среду вокруг себя и назови конкретные нейтральные детали."
  },
  {
    id: "defusion",
    title: "Когнитивный дефьюзинг",
    command: "thought -> \"I notice a thought\"",
    body: "Скажи: у меня есть мысль о X. Это создаёт дистанцию между тобой и навязчивым содержанием."
  },
  {
    id: "erp",
    title: "Экспозиция ERP",
    command: "expose -> resist -> wait",
    body: "Сознательно столкнись с небольшим триггером и не выполняй компенсативное действие."
  },
  {
    id: "compassion",
    title: "Самосострадание",
    command: "you are not your ocd",
    body: "Поговори с собой как с другим человеком. ОКР не вина, а каждая попытка уже тренировка."
  }
];

const playAchievementTone = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.55);
    gain.connect(audioContext.destination);

    [440, 660, 880].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + index * 0.08);
      oscillator.connect(gain);
      oscillator.start(audioContext.currentTime + index * 0.08);
      oscillator.stop(audioContext.currentTime + 0.5 + index * 0.04);
    });
  } catch {
    // Browser audio can be blocked before direct user interaction; celebration remains visual.
  }
};

export const App = () => {
  const [data, setData] = useState<AppData>(() => createDefaultData());
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [activeHour, setActiveHour] = useState<number | null>(new Date().getHours());
  const [draftScore, setDraftScore] = useState<HourScore>(7);
  const [draftNote, setDraftNote] = useState("");
  const [draftEntryType, setDraftEntryType] = useState<EntryType>("neutral_note");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [statRange, setStatRange] = useState<StatRange>("week");
  const [confirmReset, setConfirmReset] = useState(false);
  const [celebrationQueue, setCelebrationQueue] = useState<Achievement[]>([]);
  const previousUnlockedIdsRef = useRef<Set<string> | null>(null);

  const colorTheme = data.settings.colorTheme;
  const theme = accentThemes[data.settings.accentTheme].palettes[colorTheme];
  const hours = useMemo(
    () => getHoursRange(data.settings.startHour, data.settings.endHour),
    [data.settings.endHour, data.settings.startHour]
  );
  const currentDate = todayKey();
  const selectedEntries = useMemo(() => getEntriesForDate(data, selectedDate), [data, selectedDate]);
  const metrics = useMemo(() => getMetrics(data), [data]);
  const progress = xpProgress(data.game.totalXp);
  const selectedEntry = activeHour === null ? undefined : data.entries[getEntryKey(selectedDate, activeHour)];
  const completedToday = getEntriesForDate(data, currentDate).length;

  useEffect(() => {
    let cancelled = false;
    loadAppData().then((loaded) => {
      if (cancelled) return;
      const reconciled = reconcileGameState(loaded);
      previousUnlockedIdsRef.current = new Set(reconciled.game.unlockedAchievementIds);
      setData(reconciled);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveAppData(data);
  }, [data, hydrated]);

  useEffect(() => {
    const currentUnlockedIds = new Set(data.game.unlockedAchievementIds);

    if (previousUnlockedIdsRef.current === null) {
      previousUnlockedIdsRef.current = currentUnlockedIds;
      return;
    }

    const newAchievementIds = [...currentUnlockedIds].filter((id) => !previousUnlockedIdsRef.current?.has(id));
    previousUnlockedIdsRef.current = currentUnlockedIds;

    if (newAchievementIds.length === 0) {
      return;
    }

    const newAchievements = achievements.filter((achievement) => newAchievementIds.includes(achievement.id));
    setCelebrationQueue((queue) => [...queue, ...newAchievements]);

    if (data.settings.celebrationSoundEnabled) {
      playAchievementTone();
    }
  }, [data.game.unlockedAchievementIds, data.settings.celebrationSoundEnabled]);

  useEffect(() => {
    if (!selectedEntry) {
      setDraftScore(7);
      setDraftNote("");
      setDraftEntryType("neutral_note");
      setDraftTags([]);
      return;
    }

    setDraftScore(selectedEntry.score);
    setDraftNote(selectedEntry.note ?? "");
    setDraftEntryType(selectedEntry.entryType);
    setDraftTags(selectedEntry.tags);
  }, [selectedEntry]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty("--accent", theme.value);
    style.setProperty("--accent-soft", theme.soft);
    style.setProperty("--accent-glow", theme.glow);
  }, [theme]);

  const updateData = (updater: (previous: AppData) => AppData) => {
    setData((previous) => reconcileGameState(updater(previous)));
  };

  const handleProfileChange = (patch: Partial<UserProfile>) => {
    updateData((previous) => ({
      ...previous,
      profile: {
        ...previous.profile,
        ...patch
      }
    }));
  };

  const handleSaveEntry = () => {
    if (activeHour === null) {
      return;
    }

    updateData((previous) => {
      const key = getEntryKey(selectedDate, activeHour);
      const existing = previous.entries[key];
      const entry = createEntry(selectedDate, activeHour, draftScore, draftNote, draftEntryType, draftTags, existing);

      return {
        ...previous,
        entries: {
          ...previous.entries,
          [key]: entry
        }
      };
    });
  };

  const handleDeleteEntry = () => {
    if (activeHour === null) {
      return;
    }

    updateData((previous) => {
      const nextEntries = { ...previous.entries };
      delete nextEntries[getEntryKey(selectedDate, activeHour)];

      return {
        ...previous,
        entries: nextEntries
      };
    });
  };

  const handleSettingChange = (patch: Partial<AppData["settings"]>) => {
    updateData((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        ...patch
      }
    }));
  };

  const handleDailyNoteChange = (date: string, note: string) => {
    updateData((previous) => {
      const trimmedNote = note.trim();
      const nextDailyNotes = { ...previous.dailyNotes };

      if (!trimmedNote) {
        delete nextDailyNotes[date];
        return {
          ...previous,
          dailyNotes: nextDailyNotes
        };
      }

      return {
        ...previous,
        dailyNotes: {
          ...nextDailyNotes,
          [date]: {
            date,
            note,
            updatedAt: new Date().toISOString()
          }
        }
      };
    });
  };

  const handleTechniqueUse = (techniqueId: string, durationMinutes?: number) => {
    updateData((previous) => ({
      ...previous,
      techniqueUses: [
        {
          id: `${techniqueId}-${Date.now()}`,
          date: todayKey(),
          techniqueId,
          durationMinutes,
          createdAt: new Date().toISOString()
        },
        ...previous.techniqueUses
      ].slice(0, 250)
    }));
  };

  const handleReset = () => {
    void clearAppData().finally(() => {
      setData(createDefaultData());
      setConfirmReset(false);
      setSelectedDate(todayKey());
      setActiveHour(new Date().getHours());
    });
  };

  const exportData = () => {
    const entries = getEntries(data);
    const exportPayload = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      profile: data.profile,
      settings: data.settings,
      entries,
      dailyNotes: data.dailyNotes,
      techniqueUses: data.techniqueUses,
      game: data.game,
      achievements: achievements.map((achievement) => ({
        ...achievement,
        hidden: Boolean(achievement.hidden),
        unlocked: data.game.unlockedAchievementIds.includes(achievement.id)
      })),
      summaries: {
        metrics: getMetrics(data),
        entryTypes: getEntryTypeSummary(entries),
        tags: getTagSummary(entries)
      }
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ocd-monitor-export-${todayKey()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (file: File): Promise<{ ok: boolean; message: string }> => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const imported = importAppData(parsed);

      if (!imported) {
        return { ok: false, message: "Файл не похож на экспорт ocd-monitor" };
      }

      const reconciled = reconcileGameState(imported);
      previousUnlockedIdsRef.current = new Set(reconciled.game.unlockedAchievementIds);
      setCelebrationQueue([]);
      setData(reconciled);
      setSelectedDate(todayKey());
      setActiveHour(new Date().getHours());
      return { ok: true, message: "Импорт завершён" };
    } catch {
      return { ok: false, message: "Не удалось прочитать файл" };
    }
  };

  const shiftDate = (days: number) => {
    const next = new Date(`${selectedDate}T00:00:00`);
    next.setDate(next.getDate() + days);
    setSelectedDate(toDateKey(next));
    setActiveHour(null);
  };

  const currentCelebration = celebrationQueue[0];
  const closeCelebration = () => setCelebrationQueue((queue) => queue.slice(1));
  const useEmoji = data.settings.useEmoji;

  // Глобальные keyboard shortcuts (как в budget-desk):
  // 1-7 — переход к view, [/] — сдвиг даты на ±1 день, t — к сегодня.
  // Не срабатывают, если фокус в input/textarea.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const allViews: View[] = ["today", "stats", "calendar", "techniques", "journal", "achievements", "settings"];
      const num = Number(event.key);
      if (num >= 1 && num <= allViews.length) {
        event.preventDefault();
        setView(allViews[num - 1]);
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        shiftDate(-1);
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        shiftDate(1);
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        setSelectedDate(todayKey());
        setActiveHour(new Date().getHours());
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedDate]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-text">
            <strong>ocd-monitor</strong>
            <span className="brand-suffix">~</span>
          </div>
          <span className="brand-user">{data.profile.displayName || "local"}</span>
        </div>

        <div className="sidebar-section">/ разделы</div>
        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              className={`nav-button ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span className="nav-prefix">{item.prefix}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-section">/ система</div>
        <nav className="nav-list">
          {navMetaItems.map((item) => (
            <button
              className={`nav-button ${view === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setView(item.id)}
              type="button"
            >
              <span className="nav-prefix">{item.prefix}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="level-card">
          <div className="level-ring" style={{ background: `conic-gradient(var(--accent) ${progress.percent}%, var(--level-ring-track) 0)` }}>
            <div>{progress.level}</div>
          </div>
          <div>
            <span className="eyebrow">Уровень</span>
            <strong>{getLevelName(progress.level)}</strong>
            <p>
              {progress.current}/{progress.next || progress.current} XP
            </p>
          </div>
        </div>

        <div className="sidebar-foot">
          <div>локальная база</div>
          <div>записей: <span className="sidebar-foot-val">{Object.keys(data.entries).length}</span></div>
          <div>дней: <span className="sidebar-foot-val">{new Set(getEntries(data).map((entry) => entry.date)).size}</span></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Локальный дневник</span>
            <h1>
              <span className="prompt">›</span>
              {getTitle(view)}
            </h1>
          </div>
          <div className="topbar-actions">
            <div className="privacy-pill">
              <span>local · indexedDB</span>
            </div>
          </div>
        </header>

        {view === "today" && (
          <TodayView
            activeHour={activeHour}
            completedToday={completedToday}
            currentDate={currentDate}
            draftNote={draftNote}
            draftEntryType={draftEntryType}
            draftScore={draftScore}
            draftTags={draftTags}
            entries={selectedEntries}
            hours={hours}
            metrics={metrics}
            customTag={customTag}
            onDateShift={shiftDate}
            onDeleteEntry={handleDeleteEntry}
            onCustomTagChange={setCustomTag}
            onDraftNoteChange={setDraftNote}
            onDraftEntryTypeChange={setDraftEntryType}
            onDraftScoreChange={setDraftScore}
            onDraftTagsChange={setDraftTags}
            onSaveEntry={handleSaveEntry}
            onSelectHour={setActiveHour}
            selectedDate={selectedDate}
            selectedEntry={selectedEntry}
            useEmoji={useEmoji}
          />
        )}

        {view === "stats" && <StatsView data={data} range={statRange} selectedDate={selectedDate} setRange={setStatRange} />}

        {view === "calendar" && (
          <CalendarView
            data={data}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setActiveHour(null);
              setView("today");
            }}
            selectedDate={selectedDate}
          />
        )}

        {view === "techniques" && (
          <TechniquesView data={data} onTechniqueUse={handleTechniqueUse} useEmoji={useEmoji} />
        )}

        {view === "journal" && (
          <JournalView
            data={data}
            onDateShift={shiftDate}
            onNoteChange={handleDailyNoteChange}
            selectedDate={selectedDate}
          />
        )}

        {view === "achievements" && <AchievementsView data={data} />}

        {view === "settings" && (
          <SettingsView
            colorTheme={colorTheme}
            confirmReset={confirmReset}
            data={data}
            onConfirmResetChange={setConfirmReset}
            onExport={exportData}
            onImport={importData}
            onProfileChange={handleProfileChange}
            onReset={handleReset}
            onSettingChange={handleSettingChange}
          />
        )}
      </main>
      {currentCelebration && (
        <AchievementCelebration
          achievement={currentCelebration}
          onClose={closeCelebration}
          queueCount={celebrationQueue.length}
          themeColor={theme.value}
        />
      )}
    </div>
  );
};

const getTitle = (view: View) => {
  if (view === "today") return "Почасовой мониторинг";
  if (view === "stats") return "Динамика и паттерны";
  if (view === "calendar") return "Календарь";
  if (view === "techniques") return "Техники";
  if (view === "journal") return "Журнал";
  if (view === "achievements") return "Космические достижения";
  return "Локальные настройки";
};

interface TodayViewProps {
  activeHour: number | null;
  completedToday: number;
  currentDate: string;
  customTag: string;
  draftEntryType: EntryType;
  draftNote: string;
  draftScore: HourScore;
  draftTags: string[];
  entries: HourEntry[];
  hours: number[];
  metrics: ReturnType<typeof getMetrics>;
  onCustomTagChange: (value: string) => void;
  onDateShift: (days: number) => void;
  onDeleteEntry: () => void;
  onDraftEntryTypeChange: (entryType: EntryType) => void;
  onDraftNoteChange: (value: string) => void;
  onDraftScoreChange: (score: HourScore) => void;
  onDraftTagsChange: (tags: string[]) => void;
  onSaveEntry: () => void;
  onSelectHour: (hour: number) => void;
  selectedDate: string;
  selectedEntry?: HourEntry;
  useEmoji: boolean;
}

const TodayView = ({
  activeHour,
  completedToday,
  currentDate,
  customTag,
  draftEntryType,
  draftNote,
  draftScore,
  draftTags,
  entries,
  hours,
  metrics,
  onCustomTagChange,
  onDateShift,
  onDeleteEntry,
  onDraftEntryTypeChange,
  onDraftNoteChange,
  onDraftScoreChange,
  onDraftTagsChange,
  onSaveEntry,
  onSelectHour,
  selectedDate,
  selectedEntry,
  useEmoji
}: TodayViewProps) => {
  const averageScore = average(entries.map((entry) => entry.score));
  const selectedHourLabel = activeHour === null ? "Выберите час" : formatHour(activeHour);
  const shouldAutoExpandDetails = isDetailedScore(draftScore) || hasStructuredDetails(draftEntryType, draftTags);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const isLocked = Boolean(selectedEntry) && !editMode;

  useEffect(() => {
    if (selectedEntry) {
      setDetailsExpanded(false);
      return;
    }
    setDetailsExpanded(shouldAutoExpandDetails);
  }, [shouldAutoExpandDetails, activeHour, selectedDate, selectedEntry]);

  useEffect(() => {
    setEditMode(false);
  }, [activeHour, selectedDate]);

  const handleSave = () => {
    onSaveEntry();
    setEditMode(false);
  };

  const toggleTag = (tag: string) => {
    const normalizedTag = normalizeTag(tag);

    if (!normalizedTag) {
      return;
    }

    if (draftTags.includes(normalizedTag)) {
      onDraftTagsChange(draftTags.filter((existingTag) => existingTag !== normalizedTag));
      return;
    }

    onDraftTagsChange([...draftTags, normalizedTag]);
  };

  const addCustomTag = () => {
    const normalizedTag = normalizeTag(customTag);

    if (!normalizedTag) {
      return;
    }

    if (!draftTags.includes(normalizedTag)) {
      onDraftTagsChange([...draftTags, normalizedTag]);
    }

    onCustomTagChange("");
  };

  return (
    <div className="dashboard-grid">
      <section className="panel hero-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Сегодня отмечено</span>
            <h2>
              {completedToday}/{hours.length} часов
            </h2>
          </div>
          <div className="date-switcher">
            <button aria-label="Предыдущий день" className="icon-button" onClick={() => onDateShift(-1)} type="button">
              ‹
            </button>
            <strong>{selectedDate === currentDate ? "Сегодня" : selectedDate}</strong>
            <button aria-label="Следующий день" className="icon-button" onClick={() => onDateShift(1)} type="button">
              ›
            </button>
          </div>
        </div>

        <div className="hour-grid">
          {hours.map((hour) => {
            const entry = entries.find((candidate) => candidate.hour === hour);
            const isCurrentHour = selectedDate === currentDate && hour === new Date().getHours();
            return (
              <button
                className={`hour-tile ${getScoreTone(entry?.score)} ${activeHour === hour ? "active" : ""} ${isCurrentHour ? "current" : ""}`}
                key={hour}
                onClick={() => onSelectHour(hour)}
                type="button"
              >
                <span>{formatHour(hour)}</span>
                <strong>{entry?.score ?? "-"}</strong>
                <small>
                  {entry && <i className="type-dot" style={{ background: entryTypeMeta[entry.entryType].color }} />}
                  {entry ? entryTypeMeta[entry.entryType].shortLabel : isCurrentHour ? "сейчас" : "ожидает"}
                </small>
                {entry && entry.tags.length > 0 && <em>{entry.tags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}</em>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel editor-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Час</span>
            <h2>{selectedHourLabel}</h2>
          </div>
          <button
            aria-hidden={!selectedEntry}
            className="ghost-button danger"
            onClick={onDeleteEntry}
            style={{ visibility: selectedEntry ? "visible" : "hidden" }}
            tabIndex={selectedEntry ? 0 : -1}
            type="button"
          >
            {useEmoji && "🗑 "}Удалить
          </button>
        </div>

        <div className="score-scale">
          {Array.from({ length: 10 }, (_, index) => clampScore(index + 1)).map((score) => (
            <button
              className={`score-button ${draftScore === score ? "active" : ""} ${getScoreTone(score)}`}
              disabled={isLocked}
              key={score}
              onClick={() => onDraftScoreChange(score)}
              type="button"
            >
              {score}
            </button>
          ))}
        </div>

        <div className="score-caption">
          <span>{entryTypeMeta[draftEntryType].label} · {scoreLabels[draftScore]}</span>
          <strong>+{calculateEntryXp(draftScore, draftNote.trim().length > 0)} XP</strong>
        </div>

        <div className="terminal-note">
          <div className="terminal-prompt-line">
            <span>{getTerminalCommand(activeHour, draftEntryType)}</span>
          </div>
          <textarea
            className="terminal-textarea"
            id="hour-note"
            maxLength={240}
            onChange={(event) => onDraftNoteChange(event.target.value)}
            placeholder={getNotePlaceholder(draftScore)}
            readOnly={isLocked}
            value={draftNote}
          />
          <div className="terminal-status">
            <span>{isLocked ? "Запись сохранена. Нажмите «Редактировать» для изменений." : getTerminalHint(draftScore, draftEntryType)}</span>
            <strong>{draftNote.length}/240</strong>
          </div>
        </div>

        <button className="details-toggle" onClick={() => setDetailsExpanded((expanded) => !expanded)} type="button">
          {detailsExpanded ? "Скрыть детали" : "Добавить детали"}
        </button>

        <div className={`details-wrap ${detailsExpanded ? "open" : ""}`} aria-hidden={!detailsExpanded}>
          <div className="details-clip">
            <div className="details-panel">
              <div className="details-header">
                <span>detail --optional</span>
                <strong>{isDetailedScore(draftScore) ? "рекомендуется" : "по желанию"}</strong>
              </div>
            <div className="entry-type-grid">
              {entryTypeOrder.map((entryType) => (
                <button
                  className={`entry-type-button ${draftEntryType === entryType ? "active" : ""}`}
                  disabled={isLocked}
                  key={entryType}
                  onClick={() => onDraftEntryTypeChange(entryType)}
                  title={entryTypeMeta[entryType].description}
                  type="button"
                >
                  <i className="type-dot" style={{ background: entryTypeMeta[entryType].color }} />
                  <span>{entryTypeMeta[entryType].shortLabel}</span>
                </button>
              ))}
            </div>

            <div className="tag-editor" aria-label="Теги записи">
              <span className="field-label">Теги</span>
              <div className="tag-chip-row">
                {builtInTags.map((tag) => (
                  <button
                    className={`tag-chip ${draftTags.includes(tag) ? "active" : ""}`}
                    disabled={isLocked}
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    type="button"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              <div className="custom-tag-row">
                <input
                  aria-label="Добавить свой тег"
                  disabled={isLocked}
                  onChange={(event) => onCustomTagChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="тег + Enter"
                  value={customTag}
                />
                <button className="ghost-button" disabled={isLocked} onClick={addCustomTag} type="button">
                  Добавить
                </button>
              </div>
              {draftTags.length > 0 && (
                <div className="selected-tags">
                  {draftTags.map((tag) => (
                    <button disabled={isLocked} key={tag} onClick={() => toggleTag(tag)} type="button">
                      #{tag} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        {isLocked ? (
          <button className="primary-button" onClick={() => setEditMode(true)} type="button">
            {useEmoji && "✎ "}Редактировать
          </button>
        ) : (
          <button className="primary-button" disabled={activeHour === null} onClick={handleSave} type="button">
            {useEmoji && "💾 "}
            {selectedEntry ? "Сохранить изменения" : "Сохранить час"}
          </button>
        )}
      </section>

      <section className="metrics-strip">
        <MetricCard label="Средний балл дня" value={averageScore ? averageScore.toFixed(1) : "-"} />
        <MetricCard label="Текущая серия" value={`${metrics.currentStreak} дн.`} />
        <MetricCard label="Всего отметок" value={`${metrics.totalEntries}`} />
      </section>

      <div className="help-line">
        <span><span className="k">[</span> <span className="k">]</span> день</span>
        <span><span className="k">t</span> сегодня</span>
        <span><span className="k">1</span>-<span className="k">7</span> разделы</span>
      </div>
    </div>
  );
};

interface StatsViewProps {
  data: AppData;
  range: StatRange;
  selectedDate: string;
  setRange: (range: StatRange) => void;
}

const StatsView = ({ data, range, selectedDate, setRange }: StatsViewProps) => {
  const anchor = new Date(`${selectedDate}T00:00:00`);
  const entries = getEntries(data);
  const dayEntries = getEntriesForDate(data, selectedDate);
  const typeSummary = getEntryTypeSummary(entries).slice(0, 5);
  const tagSummary = getTagSummary(entries).slice(0, 8);
  const best = dayEntries.reduce<HourEntry | undefined>((currentBest, entry) => {
    if (!currentBest || entry.score > currentBest.score) {
      return entry;
    }
    return currentBest;
  }, undefined);
  const hardest = dayEntries.reduce<HourEntry | undefined>((currentHardest, entry) => {
    if (!currentHardest || entry.score < currentHardest.score) {
      return entry;
    }
    return currentHardest;
  }, undefined);

  return (
    <div className="stats-layout">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Период</span>
            <h2>{statRangeLabels[range]}</h2>
          </div>
          <div className="segmented">
            {(Object.keys(statRangeLabels) as StatRange[]).map((item) => (
              <button className={range === item ? "active" : ""} key={item} onClick={() => setRange(item)} type="button">
                {statRangeLabels[item]}
              </button>
            ))}
          </div>
        </div>

        {range === "day" && <DayChart entries={dayEntries} />}
        {range === "week" && <WeekChart data={data} dates={getWeekDates(anchor)} />}
        {range === "month" && <MonthHeatmap data={data} dates={getMonthDates(anchor)} />}
        {range === "year" && <YearBars data={data} months={getYearMonths(anchor)} />}
      </section>

      <section className="panel insight-panel">
        <span className="eyebrow">Сводка</span>
        <div className="insight-list">
          <MetricCard label="Дней с отметками" value={`${new Set(entries.map((entry) => entry.date)).size}`} />
          <MetricCard label="Средний балл" value={average(entries.map((entry) => entry.score)).toFixed(1)} />
          <MetricCard label="Лучший час дня" value={best ? `${formatHour(best.hour)} · ${best.score}` : "-"} />
          <MetricCard label="Трудный час дня" value={hardest ? `${formatHour(hardest.hour)} · ${hardest.score}` : "-"} />
        </div>
        <div className="soft-note">
          Статистика нужна для наблюдения паттернов, а не для оценки себя. Даже сложный час остается полезными данными.
        </div>
        <div className="summary-block">
          <span className="eyebrow">Типы записей</span>
          {typeSummary.length === 0 && <p className="muted-text">Типы появятся после первых отметок.</p>}
          {typeSummary.map((item) => (
            <div className="summary-row" key={item.type}>
              <span>{entryTypeMeta[item.type].label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
        <div className="summary-block">
          <span className="eyebrow">Частые теги</span>
          <div className="tag-chip-row compact">
            {tagSummary.length === 0 && <p className="muted-text">Теги появятся после первых отметок.</p>}
            {tagSummary.map((item) => (
              <span className="tag-chip static" key={item.tag}>
                #{item.tag} · {item.count}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const DayChart = ({ entries }: { entries: HourEntry[] }) => (
  <div className="bar-row tall">
    {entries.length === 0 && <EmptyState text="Пока нет отметок за выбранный день." />}
    {entries.map((entry) => (
      <div className="bar-item" key={entry.id}>
        <div className={`bar-fill ${getScoreTone(entry.score)}`} style={{ height: `${entry.score * 10}%` }} />
        <span>{formatHour(entry.hour)}</span>
      </div>
    ))}
  </div>
);

const WeekChart = ({ data, dates }: { data: AppData; dates: string[] }) => (
  <div className="week-grid">
    {dates.map((date, index) => {
      const entries = getEntriesForDate(data, date);
      const value = average(entries.map((entry) => entry.score));
      return (
        <div className="week-day" key={date}>
          <div className={`week-column ${getScoreTone(value)}`} style={{ height: `${Math.max(8, value * 10)}%` }} />
          <strong>{value ? value.toFixed(1) : "-"}</strong>
          <span>{weekdayLabels[index]}</span>
        </div>
      );
    })}
  </div>
);

const MonthHeatmap = ({ data, dates }: { data: AppData; dates: string[] }) => (
  <div className="heatmap">
    {dates.map((date) => {
      const entries = getEntriesForDate(data, date);
      const value = average(entries.map((entry) => entry.score));
      return (
        <div className={`heat-cell ${getScoreTone(value)}`} key={date} title={`${date}: ${value ? value.toFixed(1) : "нет данных"}`}>
          {Number(date.slice(-2))}
        </div>
      );
    })}
  </div>
);

const YearBars = ({ data, months }: { data: AppData; months: string[] }) => (
  <div className="bar-row tall">
    {months.map((month, index) => {
      const entries = getEntries(data).filter((entry) => entry.date.startsWith(month));
      const value = average(entries.map((entry) => entry.score));
      return (
        <div className="bar-item" key={month}>
          <div className={`bar-fill ${getScoreTone(value)}`} style={{ height: `${Math.max(4, value * 10)}%` }} />
          <span>{monthLabels[index]}</span>
        </div>
      );
    })}
  </div>
);

interface CalendarViewProps {
  data: AppData;
  onSelectDate: (date: string) => void;
  selectedDate: string;
}

const CalendarView = ({ data, onSelectDate, selectedDate }: CalendarViewProps) => {
  const anchor = new Date(`${selectedDate}T00:00:00`);
  const visibleMonths = [-2, -1, 0].map((offset) => new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1));

  return (
    <section className="panel calendar-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Последние 3 месяца</span>
          <h2>Карта дней</h2>
        </div>
      </div>
      <div className="calendar-months">
        {visibleMonths.map((monthDate) => (
          <MonthCalendar data={data} key={toDateKey(monthDate)} monthDate={monthDate} onSelectDate={onSelectDate} selectedDate={selectedDate} />
        ))}
      </div>
      <div className="calendar-legend">
        <span><i className="legend-dot low" />1-3</span>
        <span><i className="legend-dot mid" />4-6</span>
        <span><i className="legend-dot good" />7-8</span>
        <span><i className="legend-dot great" />9-10</span>
      </div>
    </section>
  );
};

const MonthCalendar = ({
  data,
  monthDate,
  onSelectDate,
  selectedDate
}: {
  data: AppData;
  monthDate: Date;
  onSelectDate: (date: string) => void;
  selectedDate: string;
}) => {
  const dates = getMonthDates(monthDate);
  const firstDay = new Date(`${dates[0]}T00:00:00`).getDay();
  const blankDays = firstDay === 0 ? 6 : firstDay - 1;

  return (
    <article className="month-card">
      <h3>{monthLabels[monthDate.getMonth()]} {monthDate.getFullYear()}</h3>
      <div className="month-weekdays">
        {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="month-grid">
        {Array.from({ length: blankDays }, (_, index) => <span aria-hidden="true" className="calendar-blank" key={`blank-${index}`} />)}
        {dates.map((date) => {
          const entries = getEntriesForDate(data, date);
          const value = average(entries.map((entry) => entry.score));
          const hasNote = Boolean(data.dailyNotes[date]);
          return (
            <button
              className={`calendar-day ${getScoreTone(value)} ${date === selectedDate ? "active" : ""}`}
              key={date}
              onClick={() => onSelectDate(date)}
              title={`${date}: ${entries.length} отметок${hasNote ? ", есть заметка" : ""}`}
              type="button"
            >
              <span>{Number(date.slice(-2))}</span>
              {hasNote && <small />}
            </button>
          );
        })}
      </div>
    </article>
  );
};

interface TechniquesViewProps {
  data: AppData;
  onTechniqueUse: (techniqueId: string, durationMinutes?: number) => void;
  useEmoji: boolean;
}

const TechniquesView = ({ data, onTechniqueUse, useEmoji }: TechniquesViewProps) => {
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [activeTimerMinutes, setActiveTimerMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const isRunning = remainingSeconds > 0;
  const todayUses = data.techniqueUses.filter((use) => use.date === todayKey()).length;

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (remainingSeconds !== 0 || activeTimerMinutes === null) {
      return;
    }

    onTechniqueUse("urge-delay", activeTimerMinutes);
    setActiveTimerMinutes(null);
  }, [activeTimerMinutes, onTechniqueUse, remainingSeconds]);

  const timerLabel = `${Math.floor(remainingSeconds / 60)}`.padStart(2, "0") + ":" + `${remainingSeconds % 60}`.padStart(2, "0");

  return (
    <div className="techniques-layout">
      <section className="panel technique-timer-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Отложить компульсию</span>
            <h2>{isRunning ? timerLabel : `${durationMinutes} минут`}</h2>
          </div>
        </div>
        <div className="timer-controls">
          {[5, 10, 15, 30, 60].map((minutes) => (
            <button
              className={durationMinutes === minutes ? "active" : ""}
              disabled={isRunning}
              key={minutes}
              onClick={() => setDurationMinutes(minutes)}
              type="button"
            >
              {minutes} мин
            </button>
          ))}
        </div>
        <p className="muted-text">До окончания таймера не выполняй ритуал. После сигнала просто переоцени позыв.</p>
        <button
          className="primary-button"
          onClick={() => {
            if (isRunning) {
              setRemainingSeconds(0);
              setActiveTimerMinutes(null);
              return;
            }

            setActiveTimerMinutes(durationMinutes);
            setRemainingSeconds(durationMinutes * 60);
          }}
          type="button"
        >
          {useEmoji ? (isRunning ? "⏸ Остановить" : "▶ Начать") : (isRunning ? "Остановить" : "Начать")}
        </button>
        <span className="technique-count">Сегодня применено: {todayUses}</span>
      </section>

      <section className="technique-card-grid">
        {techniqueCards.map((technique) => (
          <article className="panel technique-card" key={technique.id}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Техника</span>
                <h2>{technique.title}</h2>
              </div>
            </div>
            <pre>{technique.command}</pre>
            <p>{technique.body}</p>
            <button className="ghost-button" onClick={() => onTechniqueUse(technique.id)} type="button">
              {useEmoji && "✓ "}Я применил эту технику
            </button>
          </article>
        ))}
      </section>
    </div>
  );
};

interface JournalViewProps {
  data: AppData;
  onDateShift: (days: number) => void;
  onNoteChange: (date: string, note: string) => void;
  selectedDate: string;
}

const JournalView = ({ data, onDateShift, onNoteChange, selectedDate }: JournalViewProps) => {
  const entries = getEntriesForDate(data, selectedDate);
  const note = data.dailyNotes[selectedDate]?.note ?? "";
  const averageScore = average(entries.map((entry) => entry.score));
  const [search, setSearch] = useState("");

  const recentNotes = useMemo(() => {
    const all = Object.values(data.dailyNotes).sort((a, b) => b.date.localeCompare(a.date));
    if (!search.trim()) return all.slice(0, 12);
    const query = search.toLowerCase();
    return all.filter((daily) => daily.note.toLowerCase().includes(query) || daily.date.includes(query)).slice(0, 30);
  }, [data.dailyNotes, search]);

  return (
    <div className="journal-layout">
      <section className="panel journal-editor-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Свободная заметка</span>
            <h2>Запись на день</h2>
          </div>
          <div className="date-switcher">
            <button aria-label="Предыдущий день" className="icon-button" onClick={() => onDateShift(-1)} type="button">
              ‹
            </button>
            <strong>{selectedDate}</strong>
            <button aria-label="Следующий день" className="icon-button" onClick={() => onDateShift(1)} type="button">
              ›
            </button>
          </div>
        </div>
        <textarea
          className="journal-textarea"
          maxLength={1200}
          onChange={(event) => onNoteChange(selectedDate, event.target.value)}
          placeholder="Что важно отметить про этот день?"
          value={note}
        />
        <div className="terminal-status">
          <span>{note.trim() ? "Заметка сохраняется локально" : "Пустая заметка не хранится"}</span>
          <strong>{note.length}/1200</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Архив</span>
            <h2>Прошлые заметки</h2>
          </div>
        </div>
        <div className="toolbar">
          <div className="search">
            <span className="prefix">/ grep</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="по тексту или дате"
              type="text"
              value={search}
            />
          </div>
        </div>
        {recentNotes.length === 0 && <p className="muted-text">Пока нет заметок{search ? " по запросу" : ""}.</p>}
        <div className="summary-block">
          {recentNotes.map((daily) => (
            <div className="summary-row" key={daily.date}>
              <span>{daily.date}</span>
              <strong>{daily.note.slice(0, 80)}{daily.note.length > 80 ? "…" : ""}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="metrics-strip journal-metrics">
        <MetricCard label="Отметок в день" value={`${entries.length}`} />
        <MetricCard label="Средний балл" value={averageScore ? averageScore.toFixed(1) : "-"} />
        <MetricCard label="Дневных заметок" value={`${Object.keys(data.dailyNotes).length}`} />
      </section>
    </div>
  );
};

const AchievementsView = ({ data }: { data: AppData }) => {
  const unlocked = new Set(data.game.unlockedAchievementIds);
  const [filter, setFilter] = useState<AchievementFilter>("all");
  const filteredAchievements = achievements.filter((achievement) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "unlocked") {
      return unlocked.has(achievement.id);
    }

    if (filter === "hidden") {
      return achievement.hidden;
    }

    return getAchievementDifficulty(achievement) === filter;
  });

  return (
    <div className="achievement-layout">
      <section className="panel achievement-summary">
        <div>
          <span className="eyebrow">Разблокировано</span>
          <h2>
            {unlocked.size}/{achievements.length}
          </h2>
          <p>Достижения поддерживают регулярность, мягкое возвращение после трудных часов и снижение ритуалов.</p>
        </div>
      </section>

      <section className="panel achievement-filter-panel">
        <span className="eyebrow">Фильтр</span>
        <div className="achievement-filter-grid">
          {(Object.keys(achievementFilterLabels) as AchievementFilter[]).map((item) => (
            <button
              className={filter === item ? "active" : ""}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {achievementFilterLabels[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="achievement-grid">
        {filteredAchievements.map((achievement) => {
          const isUnlocked = unlocked.has(achievement.id);
          const isHiddenLocked = achievement.hidden && !isUnlocked;
          const difficulty = getAchievementDifficulty(achievement);
          const title = isHiddenLocked ? "Скрытое достижение" : achievement.title;
          const description = isHiddenLocked
            ? "Условие откроется после выполнения. Продолжай отмечать часы без самопроверки."
            : achievement.description;

          return (
            <article className={`achievement-card ${isUnlocked ? "unlocked" : ""} ${isHiddenLocked ? "hidden-locked" : ""}`} key={achievement.id}>
              <div className="achievement-icon">{isUnlocked ? "★" : "·"}</div>
              <div>
                <div className="achievement-meta-row">
                  <span className="eyebrow">{isHiddenLocked ? "hidden" : achievement.category}</span>
                  <span className={`difficulty-badge ${difficulty}`}>{achievementDifficultyLabels[difficulty]}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
                <strong>{isHiddenLocked ? "??? XP" : `${achievement.xp} XP`}</strong>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
};

interface SettingsViewProps {
  colorTheme: ColorTheme;
  confirmReset: boolean;
  data: AppData;
  onConfirmResetChange: (value: boolean) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<{ ok: boolean; message: string }>;
  onProfileChange: (patch: Partial<UserProfile>) => void;
  onReset: () => void;
  onSettingChange: (patch: Partial<AppData["settings"]>) => void;
}

const SettingsView = ({
  colorTheme,
  confirmReset,
  data,
  onConfirmResetChange,
  onExport,
  onImport,
  onProfileChange,
  onReset,
  onSettingChange
}: SettingsViewProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const result = await onImport(file);
    setImportStatus(result);
  };

  return (
    <div className="settings-layout">
      <section className="panel profile-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Профиль</span>
            <h2>{data.profile.displayName || "Локальный пользователь"}</h2>
          </div>
        </div>

        <div className="settings-grid profile-grid">
          <label className="field-label" htmlFor="display-name">
            Имя
            <input
              id="display-name"
              maxLength={48}
              onChange={(event) => onProfileChange({ displayName: event.target.value })}
              placeholder="Как к тебе обращаться"
              type="text"
              value={data.profile.displayName}
            />
          </label>
          <label className="field-label" htmlFor="tracking-start-date">
            Дата старта
            <input
              id="tracking-start-date"
              onChange={(event) => onProfileChange({ trackingStartDate: event.target.value })}
              type="date"
              value={data.profile.trackingStartDate ?? ""}
            />
          </label>
          <label className="field-label full-row" htmlFor="focus-statement">
            Фокус
            <textarea
              id="focus-statement"
              maxLength={180}
              onChange={(event) => onProfileChange({ focusStatement: event.target.value })}
              placeholder="Например: учусь замечать позывы и делать меньше компенсативных действий."
              value={data.profile.focusStatement ?? ""}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Окно мониторинга</span>
            <h2>{`${formatHour(data.settings.startHour)} - ${formatHour(data.settings.endHour)}`}</h2>
          </div>
        </div>

        <div className="settings-grid">
          <label className="field-label" htmlFor="start-hour">
            Начало
            <input
              id="start-hour"
              max={22}
              min={0}
              onChange={(event) => onSettingChange({ startHour: Number(event.target.value) })}
              type="number"
              value={data.settings.startHour}
            />
          </label>
          <label className="field-label" htmlFor="end-hour">
            Конец
            <input
              id="end-hour"
              max={24}
              min={1}
              onChange={(event) => onSettingChange({ endHour: Math.max(Number(event.target.value), data.settings.startHour + 1) })}
              type="number"
              value={data.settings.endHour}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Акцент</span>
            <h2>Цвет интерфейса</h2>
          </div>
        </div>
        <div className="theme-grid">
          {(Object.keys(accentThemes) as AccentTheme[]).map((themeName) => (
            <button
              className={`theme-option ${data.settings.accentTheme === themeName ? "active" : ""}`}
              key={themeName}
              onClick={() => onSettingChange({ accentTheme: themeName })}
              type="button"
            >
              <span style={{ backgroundColor: accentThemes[themeName].swatch }} />
              {accentThemes[themeName].label}
            </button>
          ))}
        </div>
        <button
          className={`theme-option sound-option ${data.settings.celebrationSoundEnabled ? "active" : ""}`}
          onClick={() => onSettingChange({ celebrationSoundEnabled: !data.settings.celebrationSoundEnabled })}
          type="button"
        >
          Звук достижений: {data.settings.celebrationSoundEnabled ? "вкл" : "выкл"}
        </button>
        <button
          className={`theme-option sound-option`}
          onClick={() => onSettingChange({ colorTheme: colorTheme === "dark" ? "light" : "dark" })}
          type="button"
        >
          Тема: {colorTheme === "dark" ? "тёмная" : "светлая"}
        </button>
        <button
          className={`theme-option sound-option ${data.settings.useEmoji ? "active" : ""}`}
          onClick={() => onSettingChange({ useEmoji: !data.settings.useEmoji })}
          type="button"
        >
          Emoji в интерфейсе: {data.settings.useEmoji ? "вкл" : "выкл (минимально)"}
        </button>
      </section>

      <section className="panel danger-zone">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Данные</span>
            <h2>Экспорт и сброс</h2>
          </div>
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={onExport} type="button">
            {data.settings.useEmoji && "📥 "}Экспорт JSON
          </button>
          <button className="ghost-button" onClick={() => fileInputRef.current?.click()} type="button">
            {data.settings.useEmoji && "📤 "}Импорт JSON
          </button>
          <input
            accept="application/json,.json"
            hidden
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          {!confirmReset && (
            <button className="ghost-button danger" onClick={() => onConfirmResetChange(true)} type="button">
              {data.settings.useEmoji && "🔄 "}Сбросить данные
            </button>
          )}
          {confirmReset && (
            <button className="primary-button danger-fill" onClick={onReset} type="button">
              {data.settings.useEmoji && "🗑 "}Подтвердить сброс
            </button>
          )}
        </div>
        {importStatus && (
          <p className={`muted-text ${importStatus.ok ? "" : "import-error"}`}>
            {importStatus.ok ? "✓ " : "✗ "}{importStatus.message}
          </p>
        )}
        <p className="muted-text">Данные хранятся в IndexedDB этого браузера. Импорт заменит текущее состояние.</p>
      </section>
    </div>
  );
};

const MetricCard = ({ label, value }: { label: string; value: string }) => (
  <article className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="empty-state">
    <span>{text}</span>
  </div>
);

interface AchievementCelebrationProps {
  achievement: Achievement;
  onClose: () => void;
  queueCount: number;
  themeColor: string;
}

const AchievementCelebration = ({ achievement, onClose, queueCount, themeColor }: AchievementCelebrationProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!canvas || prefersReducedMotion) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    let animationFrame = 0;
    const pixelRatio = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * pixelRatio;
      canvas.height = window.innerHeight * pixelRatio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    resize();

    const colors = [themeColor, "#ffcf70", "#64d7bc", "#f06f62", "#f4f0ea"];
    const particles = Array.from({ length: 150 }, () => ({
      x: window.innerWidth / 2,
      y: window.innerHeight * 0.38,
      size: 4 + Math.random() * 6,
      rotation: Math.random() * Math.PI,
      velocityX: (Math.random() - 0.5) * 13,
      velocityY: -8 - Math.random() * 10,
      gravity: 0.22 + Math.random() * 0.14,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 90 + Math.random() * 42
    }));

    const tick = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      particles.forEach((particle) => {
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.velocityY += particle.gravity;
        particle.rotation += 0.18;
        particle.life -= 1;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.globalAlpha = Math.max(0, particle.life / 90);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.55);
        context.restore();
      });

      if (particles.some((particle) => particle.life > 0)) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [achievement.id, themeColor]);

  return (
    <div className="celebration-overlay" role="dialog" aria-modal="true" aria-label="Получено достижение">
      <canvas className="confetti-canvas" ref={canvasRef} />
      <div className="celebration-card">
        <div className="terminal-line">SYSTEM::ACHIEVEMENT_UNLOCKED</div>
        <span className="eyebrow">{achievement.category}</span>
        <h2>{achievement.title}</h2>
        <p>{achievement.description}</p>
        <strong>+{achievement.xp} XP</strong>
        {queueCount > 1 && <span className="queue-note">В очереди еще: {queueCount - 1}</span>}
        <button className="primary-button" onClick={onClose} type="button">
          Забрать награду
        </button>
      </div>
    </div>
  );
};
