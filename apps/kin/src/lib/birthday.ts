export type BirthdayParts = {
  day: string;
  month: string;
  year: string;
};

const fullBirthday = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayMonthBirthday = /^--(\d{2})-(\d{2})$/;
const yearBirthday = /^\d{1,4}$/;

export const birthdayParts = (value: string): BirthdayParts => {
  const full = value.match(fullBirthday);
  if (full && Number(full[2]) >= 1 && Number(full[2]) <= 12 && Number(full[3]) >= 1 && Number(full[3]) <= daysInBirthdayMonth(full[2], full[1])) {
    return { year: full[1], month: String(Number(full[2])), day: String(Number(full[3])) };
  }

  const dayMonth = value.match(dayMonthBirthday);
  if (dayMonth && Number(dayMonth[1]) >= 1 && Number(dayMonth[1]) <= 12 && Number(dayMonth[2]) >= 1 && Number(dayMonth[2]) <= daysInBirthdayMonth(dayMonth[1], "")) {
    return { year: "", month: String(Number(dayMonth[1])), day: String(Number(dayMonth[2])) };
  }

  if (yearBirthday.test(value)) return { year: value, month: "", day: "" };
  return { year: "", month: "", day: "" };
};

export const birthdayValue = ({ day, month, year }: BirthdayParts): string => {
  if (day && month) return year
    ? `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    : `--${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return year;
};

export const daysInBirthdayMonth = (month: string, year: string): number => {
  if (!month) return 31;
  return new Date(Number(year) || 2000, Number(month), 0).getDate();
};

export const formatBirthday = (value: string): string => {
  const { day, month, year } = birthdayParts(value);
  if (day && month) {
    const date = new Date(2000, Number(month) - 1, Number(day));
    if (year) date.setFullYear(Number(year));
    return new Intl.DateTimeFormat(undefined, year
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "numeric", month: "long" },
    ).format(date);
  }
  return year || value;
};
