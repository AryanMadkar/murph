const Hero = () => {
    return (
        <section className="min-h-screen pt-20 bg-white relative overflow-hidden">
            <div className="max-w-6xl mx-auto px-10 py-16 grid grid-cols-3 gap-5 items-center">
                {/* Left Column - Main Headline */}
                <div className="pr-5">
                    <h1 className="text-5xl font-semibold leading-tight text-gray-900 tracking-tight m-0">
                        Learn by the Minute<br />
                        {/* Next 10 Years of<br /> */}
                        Earn by the Minute.<span className="text-orange-500">.</span>
                    </h1>
                </div>

                {/* Center Column - Illustration */}
                <div className="flex justify-center items-end relative z-10">
                    <div className="w-full max-w-xs relative">
                        <video
                            src="/Herovideo.mp4"
                            className="w-full h-auto object-contain"
                            autoPlay
                            loop
                            muted
                            playsInline
                        />
                    </div>
                </div>

                {/* Right Column - Subheadline */}
                <div className="pl-5">
                    <div className="max-w-xs px-7 py-6 border-l border-r border-gray-200">
                        <p className="text-base font-semibold leading-relaxed text-gray-900 mb-5">
                            Your Class. Your Time. Your Money.<br />
                            — <span className="text-orange-500">Set It Free in a Week.</span>
                        </p>
                        <p className="text-sm leading-relaxed text-gray-500 m-0">
                            A pay-per-use learning platform where students only pay for the time they actually learn, and teachers receive instant, transparent, and fair payments for every session. Powered by AI for smart class discovery and trustworthy reviews,<strong className="text-gray-900 font-semibold">we create a balanced marketplace that rewards quality learning and quality teaching.</strong>.
                        </p>
                    </div>
                </div>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center py-10 pb-16 relative z-20">
                <button className="px-10 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
                    Registration
                </button>
            </div>


        </section>
    );
};

export default Hero;
