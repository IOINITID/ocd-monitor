import type { Achievement, AccentTheme, ColorTheme, EntryType } from "./types";

export const accentThemes: Record<
  AccentTheme,
  {
    label: string;
    swatch: string;
    palettes: Record<ColorTheme, { value: string; soft: string; glow: string }>;
  }
> = {
  orange: {
    label: "Orange",
    swatch: "#E86F3A",
    palettes: {
      light: {
        value: "#E86F3A",
        soft: "rgba(232, 111, 58, 0.10)",
        glow: "rgba(232, 111, 58, 0.16)"
      },
      dark: {
        value: "#FF875C",
        soft: "rgba(255, 135, 92, 0.12)",
        glow: "rgba(255, 135, 92, 0.18)"
      }
    }
  },
  lavender: {
    label: "Lavender",
    swatch: "#8D7AD8",
    palettes: {
      light: {
        value: "#8D7AD8",
        soft: "rgba(141, 122, 216, 0.10)",
        glow: "rgba(141, 122, 216, 0.16)"
      },
      dark: {
        value: "#B8A7FF",
        soft: "rgba(184, 167, 255, 0.12)",
        glow: "rgba(184, 167, 255, 0.18)"
      }
    }
  },
  green: {
    label: "Green",
    swatch: "#6FAE7B",
    palettes: {
      light: {
        value: "#6FAE7B",
        soft: "rgba(111, 174, 123, 0.10)",
        glow: "rgba(111, 174, 123, 0.16)"
      },
      dark: {
        value: "#8EDC9D",
        soft: "rgba(142, 220, 157, 0.12)",
        glow: "rgba(142, 220, 157, 0.18)"
      }
    }
  },
  blue: {
    label: "Blue",
    swatch: "#6D9FD4",
    palettes: {
      light: {
        value: "#6D9FD4",
        soft: "rgba(109, 159, 212, 0.10)",
        glow: "rgba(109, 159, 212, 0.16)"
      },
      dark: {
        value: "#8EC8FF",
        soft: "rgba(142, 200, 255, 0.12)",
        glow: "rgba(142, 200, 255, 0.18)"
      }
    }
  }
};

const levelRanks = [
  "Наблюдатель",
  "Сборщик сигналов",
  "Пилот орбиты",
  "Навигатор",
  "Спокойный астронавт",
  "Хранитель курса",
  "Исследователь туманности",
  "Капитан выдержки",
  "Мастер гравитации",
  "Архитектор созвездий"
];

export const getLevelName = (level: number) => {
  const rank = levelRanks[Math.min(levelRanks.length - 1, Math.floor((level - 1) / 10))];
  return `${rank} ${level}`;
};

export const entryTypeMeta: Record<EntryType, { label: string; shortLabel: string; description: string; color: string }> = {
  obsession_thought: {
    label: "Обсессивная мысль",
    shortLabel: "мысль",
    description: "Навязчивая мысль, образ или сомнение.",
    color: "var(--c-lavender)"
  },
  compulsion_action: {
    label: "Компульсивное действие",
    shortLabel: "действие",
    description: "Ритуал, проверка, повторение или действие для снижения тревоги.",
    color: "var(--c-clay)"
  },
  urge: {
    label: "Позыв",
    shortLabel: "позыв",
    description: "Импульс сделать ритуал или получить заверение.",
    color: "var(--c-orange)"
  },
  trigger: {
    label: "Триггер",
    shortLabel: "триггер",
    description: "Событие, контекст или мысль, после которых стало сложнее.",
    color: "var(--c-pink)"
  },
  avoidance: {
    label: "Избегание",
    shortLabel: "избегание",
    description: "Ситуация, которую хотелось обойти, отложить или контролировать.",
    color: "var(--c-slate)"
  },
  win: {
    label: "Победа",
    shortLabel: "победа",
    description: "Момент, где удалось сделать меньше компенсативных действий.",
    color: "var(--c-sage)"
  },
  neutral_note: {
    label: "Нейтральная заметка",
    shortLabel: "заметка",
    description: "Обычное наблюдение без жесткой классификации.",
    color: "var(--c-dustyblue)"
  }
};

export const entryTypeOrder: EntryType[] = [
  "obsession_thought",
  "compulsion_action",
  "urge",
  "trigger",
  "avoidance",
  "win",
  "neutral_note"
];

export const builtInTags = [
  "проверка",
  "заверение",
  "мысли",
  "тело",
  "работа",
  "дом",
  "соцконтакт",
  "экспозиция",
  "без ритуала",
  "возврат к курсу"
];

export const xpForLevel = (level: number) => 120 + level * 36 + Math.floor(level ** 1.35 * 18);

export const levelFromXp = (xp: number) => {
  let level = 1;
  let remainingXp = xp;

  while (level < 100 && remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level);
    level += 1;
  }

  return level;
};

export const xpProgress = (xp: number) => {
  let level = 1;
  let remainingXp = xp;

  while (level < 100 && remainingXp >= xpForLevel(level)) {
    remainingXp -= xpForLevel(level);
    level += 1;
  }

  const next = level >= 100 ? 0 : xpForLevel(level);
  return {
    level,
    current: level >= 100 ? next : remainingXp,
    next,
    percent: level >= 100 ? 100 : Math.round((remainingXp / next) * 100)
  };
};

export const achievements: Achievement[] = [
  { id: "first-signal", title: "Первый сигнал", description: "Отметить первый час без самокритики.", category: "consistency", xp: 30 },
  { id: "three-checks", title: "Три точки курса", description: "Заполнить 3 часа в один день.", category: "consistency", xp: 35 },
  { id: "five-checks", title: "Пять мягких фиксаций", description: "Заполнить 5 часов в один день.", category: "consistency", xp: 45 },
  { id: "full-window", title: "Закрытая орбита", description: "Заполнить все часы выбранного окна.", category: "completion", xp: 80 },
  { id: "two-full-days", title: "Двойной виток", description: "Два дня с полностью заполненным окном.", category: "completion", xp: 120 },
  { id: "week-streak", title: "Семь спокойных восходов", description: "Отмечаться 7 дней подряд.", category: "consistency", xp: 150 },
  { id: "two-week-streak", title: "Длинная траектория", description: "Отмечаться 14 дней подряд.", category: "consistency", xp: 240 },
  { id: "month-streak", title: "Месячная миссия", description: "Отмечаться 30 дней подряд.", category: "consistency", xp: 420 },
  { id: "first-note", title: "Короткая заметка", description: "Добавить первую спокойную рефлексию.", category: "reflection", xp: 30 },
  { id: "ten-notes", title: "Бортовой журнал", description: "Добавить 10 заметок к часам.", category: "reflection", xp: 90 },
  { id: "twenty-notes", title: "Карта наблюдений", description: "Добавить 20 заметок без поиска заверений.", category: "reflection", xp: 150 },
  { id: "fifty-notes", title: "Архив ясности", description: "Добавить 50 коротких наблюдений.", category: "reflection", xp: 260 },
  { id: "score-eight", title: "Тихий импульс", description: "Получить первый час с оценкой 8 или выше.", category: "compulsion-reduction", xp: 40 },
  { id: "score-nine", title: "Чистая частота", description: "Получить первый час с оценкой 9 или выше.", category: "compulsion-reduction", xp: 55 },
  { id: "score-ten", title: "Звездный час", description: "Получить первый час с оценкой 10.", category: "compulsion-reduction", xp: 70 },
  { id: "five-high", title: "Пять устойчивых часов", description: "Набрать 5 часов с оценкой 8 или выше.", category: "compulsion-reduction", xp: 90 },
  { id: "twenty-high", title: "Двадцать мягких побед", description: "Набрать 20 часов с оценкой 8 или выше.", category: "compulsion-reduction", xp: 190 },
  { id: "fifty-high", title: "Стабильная орбита", description: "Набрать 50 часов с оценкой 8 или выше.", category: "compulsion-reduction", xp: 360 },
  { id: "ten-perfect", title: "Десять звезд", description: "Набрать 10 часов с оценкой 10.", category: "compulsion-reduction", xp: 200 },
  { id: "comeback-one", title: "Возврат к курсу", description: "После трудного часа отметить следующий более успешный.", category: "resilience", xp: 70 },
  { id: "comeback-five", title: "Пять возвращений", description: "Пять раз мягко вернуться после трудного часа.", category: "resilience", xp: 160 },
  { id: "difficult-hour-logged", title: "Честный маяк", description: "Отметить трудный час и остаться в наблюдении.", category: "resilience", xp: 45 },
  { id: "ten-difficult-logged", title: "Смелая статистика", description: "Записать 10 трудных часов без избегания дневника.", category: "resilience", xp: 120 },
  { id: "hundred-entries", title: "Сто сигналов", description: "Собрать 100 часовых отметок.", category: "consistency", xp: 360 },
  { id: "two-hundred-entries", title: "Двести координат", description: "Собрать 200 часовых отметок.", category: "consistency", xp: 620 },
  { id: "first-week-complete", title: "Неделя на радаре", description: "Заполнить отметки в 5 разных дней недели.", category: "consistency", xp: 160 },
  { id: "average-six", title: "Точка равновесия", description: "Достичь средней оценки 6+.", category: "compulsion-reduction", xp: 80 },
  { id: "average-seven", title: "Курс становится ровнее", description: "Достичь средней оценки 7+.", category: "compulsion-reduction", xp: 130 },
  { id: "average-eight", title: "Спокойная высота", description: "Достичь средней оценки 8+.", category: "compulsion-reduction", xp: 220 },
  { id: "morning-check", title: "Утренний якорь", description: "Отметить час до 12:00.", category: "consistency", xp: 40 },
  { id: "evening-check", title: "Вечерний якорь", description: "Отметить час после 20:00.", category: "consistency", xp: 40 },
  { id: "same-day-return", title: "Не бросил день", description: "Вернуться к отметкам в тот же день после паузы.", category: "resilience", xp: 75 },
  { id: "weekend-care", title: "Выходной контакт", description: "Отметиться в субботу или воскресенье.", category: "consistency", xp: 60 },
  { id: "gentle-low-note", title: "Мягкость в сложном", description: "Добавить заметку к часу с оценкой 1-3.", category: "reflection", xp: 80 },
  { id: "no-perfect-needed", title: "Без идеального дня", description: "Заполнить день с разными оценками и продолжить.", category: "resilience", xp: 90 },
  { id: "three-day-complete", title: "Три закрытых окна", description: "Три дня с полностью заполненным окном.", category: "completion", xp: 180 },
  { id: "five-day-complete", title: "Пять закрытых окон", description: "Пять дней с полностью заполненным окном.", category: "completion", xp: 260 },
  { id: "ten-day-complete", title: "Десять закрытых окон", description: "Десять дней с полностью заполненным окном.", category: "completion", xp: 440 },
  { id: "first-level-up", title: "Первый уровень", description: "Получить первый новый уровень.", category: "completion", xp: 50 },
  { id: "level-ten", title: "Орбита 10", description: "Достичь 10 уровня.", category: "completion", xp: 180 },
  { id: "level-twenty-five", title: "Туманность 25", description: "Достичь 25 уровня.", category: "completion", xp: 380 },
  { id: "level-fifty", title: "Галактика 50", description: "Достичь 50 уровня.", category: "completion", xp: 760 },
  { id: "level-hundred", title: "Дальний космос", description: "Достичь 100 уровня.", category: "completion", xp: 1500 },
  { id: "balanced-day", title: "День без крайностей", description: "Заполнить день со средней оценкой 5-8.", category: "resilience", xp: 100 },
  { id: "three-good-in-row", title: "Три ровных импульса", description: "Получить 3 подряд часа с оценкой 7+.", category: "compulsion-reduction", xp: 120 },
  { id: "five-good-in-row", title: "Пять ровных импульсов", description: "Получить 5 подряд часов с оценкой 7+.", category: "compulsion-reduction", xp: 210 },
  { id: "ten-days-any", title: "Десять дней контакта", description: "Отметиться в 10 разных дней.", category: "consistency", xp: 180 },
  { id: "thirty-days-any", title: "Тридцать дней контакта", description: "Отметиться в 30 разных дней.", category: "consistency", xp: 420 },
  { id: "fifty-days-any", title: "Пятьдесят дней контакта", description: "Отметиться в 50 разных дней.", category: "consistency", xp: 700 },
  { id: "all-achievement-preview", title: "Каталог надежды", description: "Открыть экран достижений и увидеть весь путь.", category: "reflection", xp: 25 }
];
