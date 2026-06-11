"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { 
  Trophy, 
  LayoutDashboard, 
  Calendar, 
  History, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  User as UserIcon
} from "lucide-react";

interface NavbarProps {
  user: {
    userId: string;
    name: string;
    email: string;
    role: "USER" | "ADMIN";
  };
  stats: {
    points: number;
    rank: number;
  };
}

export default function Navbar({ user, stats }: NavbarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Matches", href: "/matches", icon: Calendar },
    { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    { name: "My Predictions", href: "/my-predictions", icon: History },
  ];

  if (user.role === "ADMIN") {
    navigation.push({ name: "Admin Panel", href: "/admin", icon: Settings });
  }

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-2 text-xl font-bold tracking-tight text-emerald-400 hover:text-emerald-300 transition-colors">
              <Trophy className="h-6 w-6 text-amber-400 animate-pulse" />
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                World Cup League
              </span>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-emerald-400" : "text-slate-400"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* User Info & Actions */}
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-3 bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-1.5">
              <div className="flex flex-col text-right">
                <span className="text-xs text-slate-400 font-medium">Rank #{stats.rank}</span>
                <span className="text-sm font-bold text-amber-400">{stats.points} pts</span>
              </div>
              <div className="h-7 w-[1px] bg-slate-700" />
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <UserIcon className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-200 leading-tight truncate max-w-[100px]">
                    {user.name.split(" ")[0]}
                  </span>
                  {user.role === "ADMIN" && (
                    <span className="text-[10px] uppercase font-bold text-amber-500 leading-none">Admin</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => logout()}
              className="flex items-center justify-center p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 border border-slate-700/40 hover:border-red-900/30 transition-all cursor-pointer"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden items-center space-x-2">
            {/* Stats Badge */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs flex flex-col items-center">
              <span className="text-[10px] text-slate-400 leading-none">Rank #{stats.rank}</span>
              <span className="font-bold text-amber-400 leading-tight">{stats.points} pts</span>
            </div>
            
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-slate-950 border-b border-slate-800">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-base font-medium transition-all ${
                    active
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "text-slate-300 hover:text-white hover:bg-slate-850"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </div>
          
          <div className="pt-4 pb-4 border-t border-slate-850 px-5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <UserIcon className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <div className="text-base font-bold text-slate-200">{user.name}</div>
                <div className="text-xs text-slate-400">{user.email}</div>
              </div>
            </div>
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
