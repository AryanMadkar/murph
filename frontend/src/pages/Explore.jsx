import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Search, Loader2, User, Video, ArrowLeft } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function Explore() {
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    // Get auth token
    const getAuthHeaders = () => {
        const token = localStorage.getItem("token");
        return { Authorization: `Bearer ${token}` };
    };

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

        if (!parsedUser || !parsedUser._id) {
            navigate("/login");
            return;
        }
        setUser(parsedUser);

        // Register with socket
        socket.emit("register-user", parsedUser._id);

        // Fetch teachers
        axios
            .get(`${API_URL}/api/meetings/teachers`)
            .then((res) => {
                setTeachers(res.data.teachers);
                setLoading(false);
            })
            .catch((err) => {
                setMessage("Error loading teachers: " + err.message);
                setLoading(false);
            });

        // Listen for meeting accepted
        socket.on("meeting-accepted", ({ roomId }) => {
            setMessage("🎉 Meeting accepted! Joining call...");
            setTimeout(() => navigate(`/video-call/${roomId}`), 1500);
        });

        return () => {
            socket.off("meeting-accepted");
        };
    }, [navigate]);

    const requestMeeting = async (teacherId) => {
        try {
            const res = await axios.post(
                `${API_URL}/api/meetings/request`,
                { studentId: user._id, teacherId },
                { headers: getAuthHeaders() },
            );

            if (res.data.success) {
                setMessage("✅ Meeting request sent! Waiting for teacher...");
                socket.emit("meeting-request", {
                    teacherId,
                    studentEmail: user.email,
                    meetingId: res.data.meeting._id,
                });
            }
        } catch (err) {
            setMessage("❌ " + (err.response?.data?.message || err.message));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Explore Tutors</h1>
                    <p className="text-gray-500">Find the perfect tutor for your learning journey.</p>
                </div>
                <span className="text-sm font-medium text-gray-500 bg-gray-100 px-4 py-2 rounded-full">
                    {teachers.length} available
                </span>
            </div>

            {message && (
                <div className={`p-4 rounded-xl flex items-center gap-3 bg-gray-900 border border-gray-800 shadow-lg`}>
                    <p className={`font-black uppercase tracking-widest text-[10px] text-white`}>{message}</p>
                </div>
            )}

            {/* Tutors Grid */}
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm">
                    <Loader2 className="h-10 w-10 animate-spin mb-3" strokeWidth={1.5} />
                    <p className="font-medium">Loading available tutors...</p>
                </div>
            ) : teachers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                    <User className="h-12 w-12 mb-4 opacity-30" strokeWidth={1.5} />
                    <p className="font-medium text-lg">No tutors available right now</p>
                    <p className="text-sm opacity-60 mt-1">Please check back later</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {teachers.map((teacher) => (
                        <div
                            key={teacher._id}
                            className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center group"
                        >
                            <div className="h-20 w-20 rounded-full bg-gray-50 border border-gray-100 mb-4 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-300">
                                <User className="w-10 h-10 text-gray-400" strokeWidth={1.5} />
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 mb-1 truncate w-full" title={teacher.email}>
                                {teacher.name || teacher.email.split('@')[0]}
                            </h3>
                            <p className="text-sm text-gray-400 mb-5 truncate w-full">
                                {teacher.email}
                            </p>

                            <button
                                onClick={() => requestMeeting(teacher._id)}
                                className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 group-hover:shadow-gray-200 cursor-pointer"
                            >
                                <Video className="h-4 w-4" strokeWidth={1.5} />
                                Request Session
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
