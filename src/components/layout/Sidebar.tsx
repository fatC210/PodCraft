import { Link, useLocation } from "react-router-dom";
import { Home, Mic, Clock, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Sidebar() {
  const location = useLocation();
  const { t } = useI18n();

  const navItems = [
    { icon: Home, label: t.nav.workspace, path: "/" },
    { icon: Mic, label: t.nav.create, path: "/create" },
    { icon: Clock, label: t.nav.history, path: "/history" },
    { icon: Settings, label: t.nav.settings, path: "/settings" },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-card border-r border-border flex flex-col items-center py-6 z-50">
      <Link to="/" className="mb-8">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-bold text-sm">P</span>
        </div>
      </Link>

      <nav className="flex flex-col gap-2 flex-1">
        {navItems.map(({ icon: Icon, label, path }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`
                w-10 h-10 rounded flex items-center justify-center transition-all duration-150
                ${isActive
                  ? "bg-surface-alt text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-alt/50"
                }
              `}
              title={label}
            >
              <Icon size={20} strokeWidth={1.5} />
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
