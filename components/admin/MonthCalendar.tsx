import type { CalendarEntry } from "@/lib/bookings";
import type { Car } from "@/lib/config";
import { addDays, weekday } from "@/lib/dates";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  car: Car;
  /** First day of the month, YYYY-MM-01 */
  monthStart: string;
  daysInMonth: number;
  today: string;
  entries: CalendarEntry[];
};

/** One car's month: booked days filled, days with pending enquiries outlined */
export default function MonthCalendar({ car, monthStart, daysInMonth, today, entries }: Props) {
  const booked = new Map<string, string>();
  const pending = new Map<string, number>();
  for (const e of entries) {
    if (e.car !== car.id) continue;
    for (let d = e.start_date; d <= e.end_date; d = addDays(d, 1)) {
      if (e.status === "confirmed") booked.set(d, e.ref);
      else pending.set(d, (pending.get(d) ?? 0) + 1);
    }
  }

  const leadingBlanks = (weekday(monthStart) + 6) % 7; // Monday-first grid
  const days = Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));

  return (
    <div className="ap-cal">
      <h3>{car.name}</h3>
      <div className="ap-cal-grid">
        {WEEK.map((w) => (
          <div key={w} className="ap-cal-head">{w}</div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((d) => {
          const ref = booked.get(d);
          const enquiries = pending.get(d);
          const cls = [
            "ap-cal-day",
            ref ? "is-booked" : enquiries ? "is-pending" : "",
            d < today ? "is-past" : "",
            d === today ? "is-today" : "",
          ].join(" ");
          const title = ref ? `Booked · ${ref}` : enquiries ? `${enquiries} pending enquir${enquiries === 1 ? "y" : "ies"}` : "Free";
          return (
            <div key={d} className={cls} title={title}>
              <span>{Number(d.slice(8))}</span>
              {ref && <small>{ref}</small>}
              {!ref && enquiries ? <small>{enquiries} enq.</small> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
