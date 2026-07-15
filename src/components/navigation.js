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
  { id: "library", label: "发现", icon: Sparkles },
  { id: "planner", label: "计划", icon: CalendarDays },
  { id: "grocery", label: "清单", icon: ShoppingBasket },
  { id: "user", label: "我的家", icon: UserRound },
];

export const auxiliaryNavItems = [
  { id: "today", label: "今晚菜单", icon: CalendarDays },
  { id: "recommendations", label: "推荐详情", icon: Sparkles },
  { id: "calendar", label: "营养日历", icon: CalendarDays },
  { id: "stats", label: "饮食画像", icon: ChefHat },
];

export function getNavItem(id) {
  return [...navItems, ...auxiliaryNavItems].find((item) => item.id === id);
}

export function getPrimaryNavId(id) {
  if (["today", "recommendations"].includes(id)) return "dashboard";
  if (id === "calendar") return "planner";
  if (id === "stats") return "user";
  return navItems.some((item) => item.id === id) ? id : "dashboard";
}

export const mobileNavItems = navItems;
