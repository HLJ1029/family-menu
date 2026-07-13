import {
  CalendarDays,
  ChefHat,
  Home,
  ShoppingBasket,
  Sparkles,
  UserRound,
} from "lucide-react";

export const navItems = [
  { id: "dashboard", label: "今晚", icon: Home },
  { id: "grocery", label: "清单", icon: ShoppingBasket },
  { id: "user", label: "我的家", icon: UserRound },
];

export const auxiliaryNavItems = [
  { id: "library", label: "全部菜品库", icon: Sparkles },
  { id: "planner", label: "想连排几天", icon: CalendarDays },
  { id: "today", label: "今晚菜单", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "stats", label: "画像回看", icon: ChefHat },
];

export function getNavItem(id) {
  return [...navItems, ...auxiliaryNavItems].find((item) => item.id === id);
}

export function getPrimaryNavId(id) {
  if (["library", "planner", "today", "calendar"].includes(id)) return "dashboard";
  if (id === "stats") return "user";
  return navItems.some((item) => item.id === id) ? id : "dashboard";
}

export const mobileNavItems = navItems;
