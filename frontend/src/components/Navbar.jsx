import { useNavigate } from "react-router-dom";

const Navbar = () => {
    const navigate = useNavigate();

    const navLinks = [
        { name: 'Security', href: '#security' },
        { name: 'About', href: '#about' },
    ];

    const handleDashboardClick = () => {
        const userStr = localStorage.getItem("user");
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user.role === "teacher") {
                    navigate("/teacher-dashboard");
                } else {
                    navigate("/student-dashboard");
                }
            } catch (e) {
                console.error("Error parsing user data", e);
                navigate("/register");
            }
        } else {
            navigate("/register");
        }
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#FAFAFA]">
            <div className="max-w-6xl mx-auto px-10 py-5 flex items-center justify-between">
                {/* Logo */}
                <a href="/" className="flex items-center gap-2.5 no-underline">
                    <img src="/logo.png" alt="Murph Logo" className="w-8 h-8 object-contain" />
                    <span className="text-xl font-semibold text-gray-900 tracking-tight">Murph</span>
                </a>

                {/* Navigation Links */}
                <div className="flex items-center gap-9">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            className="text-sm font-normal text-gray-500 no-underline hover:text-gray-900 transition-colors"
                        >
                            {link.name}
                        </a>
                    ))}
                </div>

                {/* CTA Button */}
                <div className="flex items-center">
                    <button
                        onClick={handleDashboardClick}
                        className="px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-700 transition-colors cursor-pointer"
                    >
                        Dashboard
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
