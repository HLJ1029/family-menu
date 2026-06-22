import {
  CalendarDays,
  ChefHat,
  Home,
  ShoppingBasket,
  Sparkles,
  UserRound,
} from "lucide-react";

export const navItems = [
  { id: "dashboard", label: "首页", icon: Home },
  { id: "planner", label: "计划", icon: CalendarDays },
  { id: "grocery", label: "清单", icon: ShoppingBasket },
  { id: "user", label: "我的家", icon: UserRound },
];

export const auxiliaryNavItems = [
  { id: "recommendations", label: "推荐", icon: Sparkles },
  { id: "library", label: "菜谱库", icon: ChefHat },
  { id: "today", label: "今晚菜单", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "inventory", label: "家中库存", icon: ShoppingBasket },
  { id: "stats", label: "营养视图", icon: CalendarDays },
];

export function getNavItem(id) {
  return [...navItems, ...auxiliaryNavItems].find((item) => item.id === id);
}

export const mobileNavItems = [
  navItems.find((item) => item.id === "dashboard"),
  navItems.find((item) => item.id === "planner"),
  navItems.find((item) => item.id === "grocery"),
  navItems.find((item) => item.id === "user"),
].filter(Boolean);
