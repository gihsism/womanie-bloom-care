import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Settings,
  Phone,
  HelpCircle,
  Shield,
  Bell,
  Info,
  FileText,
  User,
  LogOut
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

const menuItems = [
  { title: "My Profile", url: "/dashboard/profile", icon: User },
  { title: "Settings", url: "/dashboard/settings", icon: Settings },
  { title: "Emergency Contacts", url: "/dashboard/emergency", icon: Phone },
  { title: "Help & Support", url: "/dashboard/help", icon: HelpCircle },
  { title: "Privacy & Security", url: "/dashboard/privacy", icon: Shield },
  { title: "Notifications", url: "/dashboard/notifications", icon: Bell },
  { title: "Terms & Policies", url: "/dashboard/terms", icon: FileText },
  { title: "About Womanie", url: "/dashboard/about", icon: Info },
];

export function AppSidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: 'Logged out',
      description: 'You have been logged out successfully.',
    });
    navigate('/');
  };

  return (
    <Sidebar
      className={`${isExpanded ? "w-64" : "w-16"} transition-all duration-300 ease-in-out border-r`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={!isExpanded ? "opacity-0" : "opacity-100 transition-opacity"}>
            Menu
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    className={`${isActive(item.url) ? "bg-muted text-primary font-medium" : "hover:bg-muted/50"} ${!isExpanded ? "justify-center" : ""}`}
                  >
                    <NavLink to={item.url} end className="flex items-center gap-3">
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      <span className={`${!isExpanded ? "hidden" : "block"} transition-all`}>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleLogout}
                  className={`hover:bg-muted/50 text-destructive hover:text-destructive ${!isExpanded ? "justify-center" : ""}`}
                >
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  <span className={`${!isExpanded ? "hidden" : "block"} transition-all`}>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
