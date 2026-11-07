import { normalizeUnit, parseAmount, slugify, splitFrontmatter, splitTitle } from './parse';
import { formatAmount } from './shopping';
import type { Ingredient, Meal, MealSet, SetGroup, SetOption } from './types';

const UNIT = String.raw`(?:кг|гр|г|мл|л|шт|ст\.?\s*л|ч\.?\s*л)\.?(?![а-яё])`;
const QTY = String.raw`\d+(?:[.,]\d+)?\s*${UNIT}`;
const HAS_QTY = new RegExp(QTY, 'i');
const LINK = /\[\[([^\]|#]+)[^\]]*\]\]/;
const CHOICE = /на выбор|один из вариантов|один вариант/i;

const SKIP_SECTION = /^(оценка|кжбу|что купить|ин?гредиенты|как готовить)/i;

// «до 460 кк/100 гр» — справочное значение, а не вес порции
const AMOUNT_IN_LABEL = new RegExp(String.raw`(?<![/\d.,])(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*(\d+(?:[.,]\d+)?))?(\s*${UNIT})`, 'gi');

/** Подпись варианта при «по половине от двух»: «мёд (30 гр)» → «мёд (15 гр)», диапазоны и оба веса тоже делятся. */
export function halveLabel(label: string): string {
  const half = (n: string) => formatAmount(parseAmount(n)! / 2);
  let found = false;
  const text = label.replace(AMOUNT_IN_LABEL, (_, a: string, b: string | undefined, unit: string) => {
    found = true;
    return `${half(a)}${b ? `-${half(b)}` : ''}${unit}`;
  });
  return found ? text : `${label} × ½`;
}

function splitTopLevel(text: string, sep: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    const m = depth === 0 ? text.slice(i).match(sep) : null;
    if (m && m.index === 0) {
      parts.push(current);
      current = '';
      i += m[0].length;
    } else {
      current += ch;
      i++;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const qty = (text: string) => {
  const m = text.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})`, 'i'));
  return m ? { amount: parseAmount(m[1])!, unit: normalizeUnit(m[2]) } : null;
};

const cleanName = (name: string) =>
  name
    .replace(/,\s+(?=\d)/g, ' ')
    .replace(/(\d)\s+%/g, '$1%') // «сметана 10 %» складывается со «сметана 10%»
    .replace(/\s*\(можно\s[^)]*\)?/gi, '') // «сыр (можно натереть на гарнир)»: пометка, а не название
    .replace(/^[\s:]+/, '') // «200 гр: огурцы, помидоры»
    .replace(/:\s+/g, ' ') // «Мюсли: обычные»
    .replace(/[\s,:—–-]+$/, '')
    .trim();

/** Один продукт: «мёд (30 гр)», «Отварная гречка, 190 г», «200 гр (огурцы, помидоры)», «1 ч.л. соевого соуса». */
function parseItem(text: string): Ingredient {
  const t = text.trim();

  const leading = t.match(new RegExp(`^(${QTY})\\s*(.*)$`, 'i'));
  if (leading) {
    const q = qty(leading[1])!;
    return { name: cleanName(leading[2].replace(/^\(|\)$/g, '')), ...q };
  }

  // первое количество в скобках: при «40 гр в сухом виде или 140 гр в готовом» покупаем сухой вес
  const paren = t.match(new RegExp(`^(.*?)\\(\\s*(${QTY})`, 'i'));
  if (paren) return { name: cleanName(paren[1]), ...qty(paren[2])! };

  const tail = t.match(new RegExp(`^(.+?)[,\\s]+(?:[—–-]\\s*)?(${QTY})`, 'i'));
  // «сок лимона или 1 ч.л. соевого соуса» — это выбор, а не количество сока
  if (tail && !/\sили$/i.test(tail[1])) return { name: cleanName(tail[1]), ...qty(tail[2])! };

  return { name: t, amount: null, unit: '' };
}

const OPTIONAL_ADDITION = new RegExp(String.raw`\(\s*можно добавить\s+(${QTY})\s+([^()]+?)\s*\)`, 'i');
// в файлах добавка написана в родительном падеже, а в покупках нужно обычное название
const PRODUCT_NAMES: Record<string, string> = { 'некрахмалистых овощей': 'овощи некрахмалистые' };

/** Продукты варианта: «Омлет: яйца (100 гр) + молоко (50 мл) без масла (можно добавить 100 гр овощей)». */
function parseItems(text: string): Ingredient[] {
  const addition = text.match(OPTIONAL_ADDITION);
  const parts = splitTopLevel(addition ? text.replace(addition[0], '') : text, /^\s\+\s/);
  // перед составом стоит название блюда, а не продукт; в «Мюсли: обычные (65 гр)» состава нет, это название продукта
  // в «салат: 250 гр (огурцы…)» после двоеточия вес, поэтому название остаётся
  if (parts.length > 1) parts[0] = parts[0].replace(/^[^:()\d]+:(?!\s*\d)\s*/, '');
  // «соус (сметана 10% 20 гр + кетчуп 10 гр + специи)»: покупаются продукты из скобки, а не соус
  const items = parts.flatMap((part) => {
    const inner = part.match(/^[^()]+\(([^()]*\s\+\s[^()]*)\)$/);
    return inner && HAS_QTY.test(inner[1]) ? splitTopLevel(inner[1], /^\s\+\s/).map(parseItem) : [parseItem(part)];
  });
  if (addition) {
    const name = addition[2].toLowerCase();
    items.push({ name: PRODUCT_NAMES[name] ?? name, ...qty(addition[1])! });
  }
  return items;
}

type RawOption = Omit<SetOption, 'id'>;

const FRACTION_SIGNS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Какую долю рецепта взять: «1/4 порции», «¼ порции», «0,5 порции», «половина порции». */
function parseFraction(text: string): number | undefined {
  const ratio = text.match(/(?<![\d/.,])(\d+)\s*\/\s*(\d+)(?![\d/])/);
  if (ratio && Number(ratio[2]) > 0) return Number(ratio[1]) / Number(ratio[2]);
  const sign = text.match(/[½¼¾⅓⅔]/);
  if (sign) return FRACTION_SIGNS[sign[0]];
  const count = text.match(/(\d+(?:[.,]\d+)?)\s*порц/i);
  if (count) return parseAmount(count[1]) ?? undefined;
  if (/две\s+трет/i.test(text)) return 2 / 3;
  if (/три\s+четверт/i.test(text)) return 3 / 4;
  if (/половин|пол\s*-?\s*порц/i.test(text)) return 1 / 2;
  if (/четверт/i.test(text)) return 1 / 4;
  if (/трет/i.test(text)) return 1 / 3;
  return undefined;
}

function linkOption(text: string): RawOption {
  const link = text.match(LINK)!;
  const { title } = splitTitle(link[1]);
  const clean = (s: string) => s.replace(link[0], '').replace(/\(см\.?\s*рецепт\S*\)/i, '').trim();
  const rest = clean(text);
  // «[[Борщ]], 500 гр + сметана, 10 %, 10 гр»: порция относится к рецепту, остальное покупается отдельно
  const parts = splitTopLevel(text, /^\s\+\s/);
  const main = parts.find((p) => p.includes(link[0]));
  const dish = clean(main ?? text);
  const q = dish.match(new RegExp(QTY, 'i'));
  return {
    label: `${title}${/^[,(]/.test(rest) || !rest ? '' : ' —'}${rest ? ` ${rest}` : ''}`.replace(/ ,/, ','),
    items: main ? parts.filter((p) => p !== main).map(parseItem) : [],
    recipe: slugify(link[1]),
    portion: q ? qty(q[0])! : undefined,
    fraction: parseFraction(dish),
  };
}

/** Строка может давать несколько вариантов: «индейка тушеная (170 гр) или отварная (130 гр)». */
export function parseOptions(line: string): RawOption[] {
  const text = line
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/\*+/g, '')
    .replace(/[;.\s]+$/, '')
    .trim();
  if (!text) return [];
  // подзаголовок внутри списка: «блюда из сборника:»
  if (/:$/.test(text) && !HAS_QTY.test(text) && !LINK.test(text)) return [];

  const hasPlus = splitTopLevel(text, /^\s\+\s/).length > 1;

  if (!hasPlus) {
    const alts = splitTopLevel(text, /^\s(?:или|либо)\s/i);
    if (alts.length > 1 && alts.every((a) => HAS_QTY.test(a) || LINK.test(a))) {
      return alts.flatMap((alt, i) => {
        const first = alts[0];
        const words = alt.replace(/\(.*$/, '').trim().split(/\s+/);
        // «индейка филе тушеное (170 гр) или отварное (130 гр)»: второй вариант наследует начало первого
        if (i > 0 && words.length === 1 && !LINK.test(alt)) {
          const head = first.replace(/\(.*$/, '').trim().split(/\s+/);
          if (head.length > 1) return parseOptions(`${head.slice(0, -1).join(' ')} ${alt}`);
        }
        return parseOptions(alt);
      });
    }

    // «рыба запеченная: окунь (170 гр), лосось (100 гр)»
    const list = text.match(/^([^:()]+):\s*(.+)$/);
    if (list) {
      const parts = splitTopLevel(list[2], /^,\s*/);
      if (parts.length > 1 && parts.every((p) => HAS_QTY.test(p))) {
        return parts.map((p) => {
          const item = parseItem(p);
          return { label: `${p} — ${list[1].trim()}`, items: [item] };
        });
      }
    }
  }

  if (LINK.test(text)) return [linkOption(text)];

  return [{ label: text, items: parseItems(text) }];
}

function withIds(options: RawOption[]): SetOption[] {
  const seen = new Map<string, number>();
  return options.map((o) => {
    const base = slugify(o.label) || 'option';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...o, id: n ? `${base}-${n + 1}` : base };
  });
}

const cleanHeading = (line: string) =>
  line
    .replace(/^(?:\s*#+\s*|\s*-\s+)+/, '')
    .replace(/\*+/g, '')
    .replace(/[:\s]+$/, '')
    .replace(/^(.*\([^()]*)$/, '$1)') // незакрытая скобка: «молоко 2,5% (50 мл»
    .trim();

interface RawGroup {
  heading: string;
  lines: string[];
  notes: string[];
}

function buildGroup(raw: RawGroup, warnings: string[]): SetGroup | null {
  const { heading } = raw;
  const options = raw.lines.flatMap(parseOptions);
  const marked = CHOICE.test(heading);
  const two = /два варианта/i.test(heading);
  const halves = /половин/i.test(heading);

  const title =
    heading
      .replace(/\s*\+?\s*\([^()]*(?:на выбор|один из вариантов|один вариант)[^()]*\)?\s*/i, '')
      .replace(/^один вариант.*$/i, '')
      .trim() || 'На выбор';

  const common: Ingredient[] = [];
  const milk = heading.match(/на молоке\s*(\d+(?:,\d+)?\s*%)?\s*(\d+)\s*мл/i);
  if (milk) common.push({ name: `Молоко${milk[1] ? ` ${milk[1].replace(/\s/g, '')}` : ''}`, amount: Number(milk[2]), unit: 'мл' });
  // «Хлеб рапсовый или Фитнес (40 гр) + (два варианта на выбор)»
  else if (options.length && /\)\s*\+\s*\(/.test(heading)) common.push(parseItem(title));

  if (!options.length) {
    // сам заголовок и есть позиция сета: «Хлеб рапсовый или Фитнес (40 гр)», «Чай/кофе + молоко (50 мл)»
    if (marked || /^(основное|дополнительное) блюдо/i.test(heading)) {
      warnings.push(`раздел «${title}» без вариантов`);
      return null;
    }
    const own = parseOptions(heading);
    return {
      id: slugify(title) || 'group',
      title: LINK.test(title) ? (own[0]?.label ?? title) : title,
      pick: own.length > 1 ? 1 : 0,
      common: [],
      options: withIds(own),
      note: raw.notes.join(' ') || undefined,
    };
  }

  const pick: SetGroup['pick'] = two || halves ? 2 : options.length > 1 ? 1 : 0;
  return {
    id: slugify(title) || 'group',
    title,
    pick,
    halves: halves || undefined,
    common,
    options: withIds(options),
    note: raw.notes.join(' ') || undefined,
  };
}

export function parseSet(markdown: string, fileName: string, meal: Meal): { set: MealSet; warnings: string[] } {
  const { body } = splitFrontmatter(markdown);
  const warnings: string[] = [];
  const raws: RawGroup[] = [];
  const setNotes: string[] = [];
  let current: RawGroup | null = null;
  let skipping = false;

  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const headed = /^#{1,6}\s/.test(t) || /^-\s+#{1,6}\s/.test(t);
    if (headed) {
      const heading = cleanHeading(t);
      skipping = SKIP_SECTION.test(heading);
      current = skipping || !heading ? null : { heading, lines: [], notes: [] };
      if (current) raws.push(current);
      continue;
    }
    if (skipping) continue;
    if (!current) {
      setNotes.push(t);
      continue;
    }
    if (/^[-*+]\s/.test(t) || LINK.test(t) || HAS_QTY.test(t)) current.lines.push(t);
    else current.notes.push(t);
  }

  const groups: SetGroup[] = [];
  const ids = new Map<string, number>();
  for (const raw of raws) {
    const group = buildGroup(raw, warnings);
    if (!group) continue;
    const n = ids.get(group.id) ?? 0;
    ids.set(group.id, n + 1);
    groups.push(n ? { ...group, id: `${group.id}-${n + 1}` } : group);
  }
  if (!groups.length) warnings.push('не найдено ни одного раздела с блюдами');

  const name = fileName.replace(/\.md$/i, '').trim();
  return {
    set: {
      id: `${meal}-${slugify(fileName)}`,
      name,
      meal,
      groups,
      note: setNotes.join(' ') || undefined,
      source: fileName,
    },
    warnings,
  };
}
