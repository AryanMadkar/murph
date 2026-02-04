const Navbar = () => {
    const navLinks = [
        { name: '60-Second Fit Test', href: '#fit-test' },
        { name: 'Pricing', href: '#pricing' },
        { name: 'Security', href: '#security' },
        { name: 'About', href: '#about' },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white">
            <div className="max-w-6xl mx-auto px-10 py-5 flex items-center justify-between">
                {/* Logo */}
                <a href="/" className="flex items-center gap-2.5 no-underline">
                    <span className="w-7 h-7 bg-orange-500 rounded-full"></span>
                    <span className="text-xl font-semibold text-gray-900 tracking-tight">Humble</span>
                </a>

                {/* Navigation Links */}
                <div className="flex items-center gap-9">
                    {navLinks.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            className="text-sm font-normal text-gray-600 no-underline hover:text-gray-900 transition-colors"
                        >
                            {link.name}
                        </a>
                    ))}
                </div>

                {/* CTA Button */}
                <div className="flex items-center">
                    <button className="px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-700 transition-colors">
                        Book a Session
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
