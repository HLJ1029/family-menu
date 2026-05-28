export const calendarWeekdays = ["日", "一", "二", "三", "四", "五", "六"];

export function getCurrentPlanDay() {
  const dayIndex = new Date().getDay();
  const dayMap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return dayMap[dayIndex] ?? "周一";
}

export function addDays(date, offset) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate;
}

export function addMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日 周${calendarWeekdays[date.getDay()]}`;
}

export function formatMonthTitle(dateKey) {
  const date = parseDateKey(dateKey);
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

export function getCalendarMonthDates(anchorDate) {
  const firstDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = addDays(firstDate, -firstDate.getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}
