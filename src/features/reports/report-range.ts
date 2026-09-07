export type ReportRange = "today" | "7d" | "30d" | "month" | "custom";

export type ReportSearchParams = {
  range?: string;
  month?: string;
  start?: string;
  end?: string;
  print?: string;
};

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function manilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateSerial(value: string | undefined) {
  const match = value?.match(DATE_PATTERN);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const serial = Date.UTC(year, month - 1, day);
  const parsed = new Date(serial);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return serial;
}

function formatDateRange(startSerial: number, endSerial: number) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${formatter.format(new Date(startSerial))} – ${formatter.format(new Date(endSerial))}`;
}

export function getManilaDateKey(date: Date) {
  const { year, month, day } = manilaDateParts(date);
  return dateKeyFromParts(year, month, day);
}

export function resolveReportRange(
  params: ReportSearchParams,
  now = new Date(),
) {
  const requestedRange = params.range;
  const range: ReportRange =
    requestedRange === "7d" ||
    requestedRange === "30d" ||
    requestedRange === "month" ||
    requestedRange === "custom"
      ? requestedRange
      : "today";
  const today = manilaDateParts(now);
  const todayKey = dateKeyFromParts(today.year, today.month, today.day);
  const currentMonth = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const selectedMonth = MONTH_PATTERN.test(params.month ?? "")
    ? String(params.month)
    : currentMonth;
  const requestedStartSerial = parseDateSerial(params.start);
  const requestedEndSerial = parseDateSerial(params.end);

  let startSerial = Date.UTC(today.year, today.month - 1, today.day);
  let endSerial = startSerial + DAY_MS;
  let rangeLabel = "Today";
  let validationError: string | null = null;

  if (range === "7d") {
    startSerial -= 6 * DAY_MS;
    rangeLabel = "Last 7 days";
  } else if (range === "30d") {
    startSerial -= 29 * DAY_MS;
    rangeLabel = "Last 30 days";
  } else if (range === "month") {
    const [year, month] = selectedMonth.split("-").map(Number);
    startSerial = Date.UTC(year, month - 1, 1);
    endSerial = Date.UTC(year, month, 1);
    rangeLabel = new Intl.DateTimeFormat("en-PH", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(startSerial));
  } else if (range === "custom") {
    rangeLabel = "Custom range";
    if (requestedStartSerial === null || requestedEndSerial === null) {
      validationError = "Choose a valid start date and end date.";
    } else if (requestedEndSerial < requestedStartSerial) {
      validationError = "End date cannot be earlier than start date.";
    } else {
      startSerial = requestedStartSerial;
      endSerial = requestedEndSerial + DAY_MS;
      rangeLabel = formatDateRange(requestedStartSerial, requestedEndSerial);
    }
  }

  return {
    range,
    rangeLabel,
    selectedMonth,
    customStart: requestedStartSerial === null ? todayKey : String(params.start),
    customEnd: requestedEndSerial === null ? todayKey : String(params.end),
    validationError,
    startSerial,
    endSerial,
    startAt: new Date(startSerial - MANILA_OFFSET_MS).toISOString(),
    endAt: new Date(endSerial - MANILA_OFFSET_MS).toISOString(),
    startExpenseDate: new Date(startSerial).toISOString().slice(0, 10),
    endExpenseDate: new Date(endSerial).toISOString().slice(0, 10),
  };
}
