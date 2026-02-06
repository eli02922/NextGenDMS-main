import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "../components/ui/button";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ScrollArea } from "../components/ui/scroll-area";
import { 
  FileText, 
  LayoutDashboard, 
  Upload, 
  Archive, 
  Scale, 
  Trash2, 
  ClipboardList, 
  Users, 
  LogOut,
  ChevronRight,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";
import fileIcon from "@/assets/logo.png";
const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard, permission: null },
  { path: "/documents", label: "Documents", icon: FileText, permission: "documents:read" },
  { path: "/upload", label: "Upload", icon: Upload, permission: "documents:write" },
  { path: "/records", label: "Records", icon: Archive, permission: "records:manage" },
  { path: "/legal-holds", label: "Legal Holds", icon: Scale, permission: "records:manage" },
  { path: "/disposition", label: "Disposition", icon: Trash2, permission: "records:manage" },
  { path: "/audit", label: "Audit Logs", icon: ClipboardList, permission: "audit:read" },
  { path: "/admin", label: "Admin", icon: Users, permission: "admin" },
];

export default function DashboardLayout({ children }) {
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const visibleNavItems = navItems.filter(
    item => !item.permission || hasPermission(item.permission)
  );

  const getInitials = (name) => {
    return name?.split(" ").map(n => n[0]).join("").toUpperCase() || "U";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="mobile-menu-toggle"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded flex items-center justify-center">
  <img
    src={fileIcon}
    width={300}
    height={300}
    alt="File icon"
    className=""
  />
            </div>
            <span className="font-heading font-bold">NextGen DMS</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" data-testid="user-menu">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(user?.full_name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="font-normal">
                <p className="font-medium">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="logout-btn">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-64 bg-card border-r z-50 transform transition-transform duration-200",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b">
            <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded flex items-center justify-center">
  <img
    src={fileIcon}
    width={300}
    height={300}
    alt="File icon"
    className=""
  />
            </div>
              <div>
                <span className="text-lg font-heading font-bold">NextGen</span>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">DMS</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {visibleNavItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all",
                      isActive 
                        ? "bg-primary text-primary-foreground font-medium" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* User section */}
          <div className="p-4 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center gap-3 w-full p-2 rounded hover:bg-muted transition-colors text-left"
                  data-testid="sidebar-user-menu"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                      {getInitials(user?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user?.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.roles?.join(", ")}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} data-testid="sidebar-logout">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
