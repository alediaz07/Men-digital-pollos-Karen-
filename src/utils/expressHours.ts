/** Horario de exprés, siempre evaluado en Costa Rica (UTC-6). */
export interface ExpressSchedule {
  expressOpen?: string;
  expressClose?: string;
  expressDays?: number[]; // 0 domingo, 1 lunes... 6 sábado
  expressTemporarilyClosed?: boolean;
}
export function expressAvailability(config: ExpressSchedule, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Costa_Rica", weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23"
  }).formatToParts(now);
  const val = (t: string) => parts.find(p => p.type === t)?.value || "";
  const dow: Record<string,number> = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  const day = dow[val("weekday")];
  const minute = Number(val("hour"))*60 + Number(val("minute"));
  const parse = (value: string) => { const m = /^(?:[01]\\d|2[0-3]):[0-5]\\d$/.exec(value); return m ? Number(value.slice(0,2))*60+Number(value.slice(3)) : NaN; };
  const start = parse(config.expressOpen || "07:00");
  const end = parse(config.expressClose || "16:00");
  const days = config.expressDays || [1,2,3,4,5];
  const open = !config.expressTemporarilyClosed && days.includes(day) && minute >= start && minute < end;
  return {open, day, minute, start, end, timeZone:"America/Costa_Rica",
    description: "Lunes a viernes, de 7:00 a.m. a 4:00 p.m."};
}
