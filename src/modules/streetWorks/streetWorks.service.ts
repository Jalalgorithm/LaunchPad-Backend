import { RowDataPacket } from "mysql2";
import { pool } from "../../config/db";
import type { MailAttachment } from "../../config/mailer";
import { buildCsv } from "../waitlist/waitlist.csv";
import {
  HARM_POINTS,
  MIN_REPORTS_TO_NAME_STREET,
  REPORTED_BY_LABELS,
  TICK_LABELS,
  TICKS,
  type Area,
  type ReportedBy,
  type Tick,
} from "./streetWorks.catalogue";
import type { BoardQuery, CreateReportInput } from "./streetWorks.validation";

interface ReportRow extends RowDataPacket {
  reported_on: Date | string;
  area: Area;
  street: string | null;
  ticks: string;
  reported_by: ReportedBy;
}

interface Report {
  day: string;
  area: Area;
  street: string | null;
  ticks: Tick[];
  by: ReportedBy;
}

const LONDON_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

const toDay = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const toReport = (row: ReportRow): Report => ({
  day: toDay(row.reported_on),
  area: row.area,
  street: row.street,
  ticks: row.ticks.split(",").filter(Boolean) as Tick[],
  by: row.reported_by,
});

/** "Romford Rd." and "romford road" are the same street for counting. */
const streetKey = (street: string): string =>
  street
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\b(rd)\b/g, "road")
    .replace(/\b(st)\b/g, "street")
    .replace(/\s+/g, " ")
    .trim();

export async function createReport(input: CreateReportInput): Promise<void> {
  await pool.query(
    `INSERT INTO street_works_reports (reported_on, area, street, ticks, reported_by)
     VALUES (?, ?, ?, ?, ?)`,
    [LONDON_DAY.format(new Date()), input.area, input.street ?? null, input.ticks.join(","), input.by]
  );
}

async function fetchReports(period: BoardQuery["period"]): Promise<Report[]> {
  const where = period === "30" ? "WHERE reported_on >= (CURRENT_DATE - INTERVAL 30 DAY)" : "";
  const [rows] = await pool.query<ReportRow[]>(
    `SELECT reported_on, area, street, ticks, reported_by
       FROM street_works_reports ${where}
      ORDER BY reported_on DESC, id DESC`
  );
  return rows.map(toReport);
}

/* ------------------------------------------------------------------ *
 * Public board — totals only
 * ------------------------------------------------------------------ */

interface BoardRow {
  /** Street name, area, or the label of what happened. */
  name: string;
  /** The area, for street rows. */
  area: string | null;
  reports: number;
  harm: number;
  /** How many reports in this row ticked each option. */
  counts: Record<Tick, number>;
}

const emptyCounts = (): Record<Tick, number> =>
  Object.fromEntries(TICKS.map((tick) => [tick, 0])) as Record<Tick, number>;

const harmOf = (report: Report): number =>
  report.ticks.reduce((sum, tick) => sum + HARM_POINTS[tick], 0);

function aggregate(groups: Map<string, { name: string; area: string | null; reports: Report[] }>): BoardRow[] {
  return [...groups.values()]
    .map(({ name, area, reports }) => {
      const counts = emptyCounts();
      for (const report of reports) for (const tick of report.ticks) counts[tick] += 1;
      return { name, area, reports: reports.length, harm: reports.reduce((s, r) => s + harmOf(r), 0), counts };
    })
    .sort((a, b) => b.harm - a.harm || b.reports - a.reports)
    .slice(0, 15);
}

function byStreet(reports: Report[]): BoardRow[] {
  // How many reports name each street, across all areas — the threshold is
  // what decides whether a street's name may be shown at all.
  const namedTimes = new Map<string, number>();
  for (const r of reports) {
    if (!r.street) continue;
    const key = streetKey(r.street);
    namedTimes.set(key, (namedTimes.get(key) ?? 0) + 1);
  }

  const groups = new Map<string, { name: string; area: string | null; reports: Report[] }>();
  for (const r of reports) {
    const key = r.street ? streetKey(r.street) : "";
    const named = key && (namedTimes.get(key) ?? 0) >= MIN_REPORTS_TO_NAME_STREET;
    const groupKey = named ? `${key}|${r.area}` : `~other|${r.area}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        name: named ? (r.street as string) : `Other streets in ${r.area}`,
        area: named ? r.area : null,
        reports: [],
      });
    }
    groups.get(groupKey)!.reports.push(r);
  }
  return aggregate(groups);
}

function byArea(reports: Report[]): BoardRow[] {
  const groups = new Map<string, { name: string; area: string | null; reports: Report[] }>();
  for (const r of reports) {
    if (!groups.has(r.area)) groups.set(r.area, { name: r.area, area: null, reports: [] });
    groups.get(r.area)!.reports.push(r);
  }
  return aggregate(groups);
}

function byTick(reports: Report[]): BoardRow[] {
  const groups = new Map<string, { name: string; area: string | null; reports: Report[] }>();
  for (const r of reports) {
    for (const tick of r.ticks) {
      if (!groups.has(tick)) groups.set(tick, { name: tick, area: null, reports: [] });
      groups.get(tick)!.reports.push(r);
    }
  }
  return aggregate(groups);
}

export async function getBoard(query: BoardQuery) {
  const reports = await fetchReports(query.period);
  const has = (tick: Tick) => reports.filter((r) => r.ticks.includes(tick)).length;

  return {
    period: query.period,
    totals: {
      reports: reports.length,
      falls: has("fall"),
      missed: has("missed"),
      cutOff: reports.filter((r) => r.ticks.includes("isolated") || r.ticks.includes("avoided")).length,
    },
    streets: byStreet(reports),
    areas: byArea(reports),
    ticks: byTick(reports),
  };
}

/* ------------------------------------------------------------------ *
 * Admin export — every report, for IGMS staff only
 * ------------------------------------------------------------------ */

const CSV_HEADER = ["Date", "Area", "Street", "What happened", "Harm points", "Reported by"] as const;

export async function buildReportsCsv(): Promise<MailAttachment> {
  const reports = await fetchReports("all");
  const rows = reports.map((r) => [
    r.day,
    r.area,
    r.street ?? "",
    r.ticks.map((tick) => TICK_LABELS[tick]).join("; "),
    String(harmOf(r)),
    REPORTED_BY_LABELS[r.by],
  ]);
  const stamp = new Date().toISOString().slice(0, 10);
  return { name: `igms-street-works-${stamp}.csv`, content: buildCsv(CSV_HEADER, rows) };
}
