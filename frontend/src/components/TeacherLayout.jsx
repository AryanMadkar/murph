import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Home, Upload, Wallet, LogOut, User } from "lucide-react";

// Navigation items for Teacher
const navItems = [
    { id: "/teacher-dashboard", label: "Home", icon: Home },
    { id: "/teacher/upload", label: "Upload", icon: Upload },
    { id: "/teacher/wallet", label: "Wallet", icon: Wallet },
];

export default function TeacherLayout() {
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
        <div className="flex min-h-screen bg-[#FAFAFA] font-['Source_Sans_Pro']">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-100 flex flex-col fixed h-full z-10 transition-all">
                {/* Logo */}
                <div className="p-6 pb-4">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                        Murph
                    </h1>
                </div>

                <div className="px-6 py-8 flex flex-col items-center border-b border-gray-100/50">
                    <div className="w-20 h-20 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 mb-3 shadow-inner">
                        <User className="w-10 h-10" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-black text-gray-900">
                        {user?.name || user?.email?.split("@")[0] || "Username"}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-1">
                        Professional Tutor
                    </p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6">
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const isActive = location.pathname === item.id;
                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => navigate(item.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer group ${isActive
                                            ? "bg-gray-900 text-white shadow-lg shadow-gray-200"
                                            : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                                            }`}
                                    >
                                        <item.icon className={`h-5 w-5 transition-colors ${isActive ? "text-white" : "text-gray-400 group-hover:text-gray-900"}`} strokeWidth={1.5} />
                                        {item.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Logout */}
                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer"
                    >
                        <LogOut className="h-5 w-5" strokeWidth={1.5} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 ml-64 p-10">
                <Outlet context={{ user }} />
            </main>
        </div>
    );
}
