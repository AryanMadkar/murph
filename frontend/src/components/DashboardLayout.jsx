import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  Compass,
  Calendar,
  Wallet,
  LogOut,
  GraduationCap,
} from "lucide-react";

// Navigation items
const navItems = [
  { id: "/student-dashboard", label: "Home", icon: Home },
  { id: "/explore", label: "Explore", icon: Compass },
  { id: "/my-sessions", label: "My Sessions", icon: Calendar },
  { id: "/virtual-teacher", label: "AI Teacher", icon: GraduationCap },
  { id: "/wallet", label: "Wallet", icon: Wallet },
];

export default function DashboardLayout() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    let parsedUser = null;
    try {
      if (userData && userData !== "undefined") {
        parsedUser = JSON.parse(userData);
      }
    } catch (e) {
      console.error("Error parsing user data:", e);
    }

    if (!parsedUser || (!parsedUser.id && !parsedUser._id)) {
      navigate("/login");
      return;
    }
    setUser(parsedUser);
  }, [navigate]);

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("pendingPaymentIntent");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-[#F5F5F5] font-['Source_Sans_Pro']">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="p-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Murph
          </h1>
        </div>

        {/* Profile Section */}
        <div className="px-6 py-4 flex flex-col items-center border-b border-gray-100">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium mb-2">
            Profile
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {user?.name || user?.email?.split("@")[0] || "Username"}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => navigate(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    location.pathname === item.id
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-56 p-10">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
