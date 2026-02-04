const Hero = () => {
    return (
        <section className="min-h-screen pt-20 bg-white relative overflow-hidden">
            <div className="max-w-6xl mx-auto px-10 py-16 grid grid-cols-3 gap-5 items-center">
                {/* Left Column - Main Headline */}
                <div className="pr-5">
                    <h1 className="text-5xl font-semibold leading-tight text-gray-900 tracking-tight m-0">
                        Your Factory's<br />
                        Next 10 Years of<br />
                        Productivity<span className="text-orange-500">.</span>
                    </h1>
                </div>

                {/* Center Column - Illustration */}
                <div className="flex justify-center items-end relative z-10">
                    <div className="w-full max-w-xs relative">
                        <img
                            src="/factory-worker.png"
                            alt="Factory worker with tablet"
                            className="w-full h-auto object-contain"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                            }}
                        />
                        {/* Fallback illustration */}
                        <div className="hidden flex-col items-center justify-end min-h-96">
                            <div className="relative w-48 h-80">
                                <div className="w-20 h-24 bg-gradient-to-b from-gray-400 to-gray-500 rounded-full mx-auto relative">
                                    <div className="absolute top-5 left-1/2 -translate-x-1/2 w-12 h-2 bg-amber-400 rounded"></div>
                                </div>
                                <div className="w-36 h-48 bg-gradient-to-b from-gray-200 to-gray-300 rounded-t-3xl -mt-2.5 mx-auto"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column - Subheadline */}
                <div className="pl-5">
                    <div className="max-w-xs px-7 py-6 border-l border-r border-gray-200">
                        <p className="text-base font-semibold leading-relaxed text-gray-900 mb-5">
                            Your Factory Is Stuck in Yesterday's Tools<br />
                            — <span className="text-orange-500">Set It Free in a Week.</span>
                        </p>
                        <p className="text-sm leading-relaxed text-gray-500 m-0">
                            Ditch spreadsheets and rigid software
                            modules. You explain the pain, Humble
                            listens to your operators, agents write the
                            code, and <strong className="text-gray-900 font-semibold">ship a live Factory OS in 24 hours</strong>.
                        </p>
                    </div>
                </div>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center py-10 pb-16 relative z-20">
                <button className="px-10 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                    Start my 24h Build
                </button>
            </div>

            {/* Orange Wave Section */}
            <div className="relative -mt-10">
                <div className="w-full leading-none">
                    <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-20">
                        <path d="M0 80V40C200 0 400 60 720 40C1040 20 1240 60 1440 40V80H0Z" fill="#FF5722" />
                    </svg>
                </div>
                <div className="bg-orange-500 px-10 py-10 pb-20 flex justify-center">
                    <div className="w-full max-w-4xl bg-gray-900 rounded-t-2xl p-4 pt-4 pb-0 shadow-2xl">
                        <div className="w-full h-96 bg-gradient-to-b from-gray-700 to-gray-800 rounded-t-lg"></div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Hero;
