import {
  CalendarDays,
  ChefHat,
  Home,
  PackageCheck,
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
  { id: "library", label: "自己挑", icon: Sparkles },
  { id: "planner", label: "周计划", icon: CalendarDays },
  { id: "today", label: "今晚菜单", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "inventory", label: "家中已有", icon: PackageCheck },
  { id: "stats", label: "画像回看", icon: ChefHat },
];

export function getNavItem(id) {
  return [...navItems, ...auxiliaryNavItems].find((item) => item.id === id);
}

export const mobileNavItems = navItems;
