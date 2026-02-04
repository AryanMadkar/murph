import { Link } from 'react-router-dom';

const Hero = () => {
    return (
        <section className="min-h-screen pt-28 bg-[#FAFAFA] relative overflow-hidden">
            <div className="max-w-[1400px] mx-auto px-12 grid grid-cols-[1fr_1.5fr_1fr] gap-4 items-center h-full">
                {/* Left Column - Main Headline */}
                <div className="pr-2 relative z-20">
                    <h1 className="text-7xl font-bold leading-tight text-gray-900 tracking-tight m-0">
                        Learn by the Minute<br />
                        Earn by the Minute<span className="text-orange-500">.</span>
                    </h1>
                </div>

                {/* Center Column - Illustration */}
                <div className="flex justify-center items-end relative z-10">
                    <div className="w-full max-w-2xl relative">
                        <video
                            src="/Herovideo.mp4"
                            className="w-full h-auto object-contain scale-165"
                            autoPlay
                            loop
                            muted
                            playsInline
                        />
                    </div>
                </div>

                {/* Right Column - Subheadline */}
                <div className="pl-6 relative z-20">
                    <div className="max-w-md px-8 py-8 border-l-4 border-gray-900">
                        <p className="text-xl font-bold leading-relaxed text-gray-900 mb-6">
                            Your Class. Your Time. Your Money.<br />
                            — <span className="text-orange-500">Set It Free in a Week.</span>
                        </p>
                        <p className="text-lg font-medium leading-relaxed text-gray-600 m-0">
                            A pay-per-use learning platform where students only pay for the time they actually learn, and teachers receive instant, transparent, and fair payments for every session. Powered by AI for smart class discovery and trustworthy reviews,<strong className="text-gray-900 font-extrabold">we create a balanced marketplace that rewards quality learning and quality teaching.</strong>.
                        </p>
                    </div>
                </div>
            </div>

            {/* CTA Button */}
            <div className="flex justify-center py-10 pb-16 relative z-20">
                <Link to="/register" className="px-10 py-4 bg-gray-900 text-white text-base font-medium rounded-full hover:bg-gray-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 no-underline inline-block">
                    Registration
                </Link>
            </div>


        </section>
    );
};

export default Hero;
