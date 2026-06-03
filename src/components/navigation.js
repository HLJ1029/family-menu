import {
  BarChart3,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Home,
  PackageCheck,
  ShoppingBasket,
  UserRound,
} from "lucide-react";

export const navItems = [
  { id: "dashboard", label: "首页", icon: Home },
  { id: "library", label: "菜单库", icon: ChefHat },
  { id: "today", label: "今晚菜单", icon: ClipboardList },
  { id: "planner", label: "一周计划", icon: CalendarDays },
  { id: "calendar", label: "日历", icon: CalendarDays },
  { id: "grocery", label: "食材清单", icon: ShoppingBasket },
  { id: "inventory", label: "家中库存", icon: PackageCheck },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "user", label: "我的家", icon: UserRound },
];

export const mobileNavItems = navItems.filter((item) =>
  ["dashboard", "library", "planner", "grocery"].includes(item.id),
);
