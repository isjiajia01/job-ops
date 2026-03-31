import {
  ContactRound,
  FileText,
  Home,
  Inbox,
  Settings,
} from "lucide-react";

export type NavLink = {
  to: string;
  label: string;
  icon: typeof Home;
  activePaths?: string[];
};

export const NAV_LINKS: NavLink[] = [
  { to: "/overview", label: "Overview", icon: Home },
  {
    to: "/applications",
    label: "Applications",
    icon: FileText,
    activePaths: ["/applications", "/job"],
  },
  {
    to: "/profile-hub",
    label: "Profile Hub",
    icon: ContactRound,
    activePaths: ["/profile-hub"],
  },
  { to: "/tracking-inbox", label: "Tracking Inbox", icon: Inbox },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const isNavActive = (
  pathname: string,
  to: string,
  activePaths?: string[],
) => {
  if (pathname === to) return true;
  if (!activePaths) return false;
  return activePaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
};
