import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Calendar, Clock, CheckCircle, XCircle, Video, DollarSign, Loader2, History } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export default function MySessions() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
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

        // Fetch all sessions
        fetchAllSessions(parsedUser._id);
    }, [navigate]);

    const fetchAllSessions = async (studentId) => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/api/meetings/student/${studentId}/history`, {
                headers: getAuthHeaders(),
            });
            if (res.data.success) {
                setSessions(res.data.sessions || []);
            }
        } catch (err) {
            console.error("Failed to fetch sessions:", err);
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case "completed":
                return (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                        <CheckCircle className="h-3 w-3" /> Completed
                    </span>
                );
            case "pending":
                return (
                    <span className="flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
                        <Clock className="h-3 w-3" /> Pending
                    </span>
                );
            case "accepted":
                return (
                    <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                        <Video className="h-3 w-3" /> Active
                    </span>
                );
            case "declined":
                return (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                        <XCircle className="h-3 w-3" /> Declined
                    </span>
                );
            case "cancelled":
                return (
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded-full">
                        <XCircle className="h-3 w-3" /> Cancelled
                    </span>
                );
            default:
                return (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        {status}
                    </span>
                );
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "N/A";
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };



    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Sessions</h1>
                    <p className="text-gray-500">View your learning history and active sessions.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <span className="text-sm text-gray-500">{sessions.length} total sessions</span>
                </div>
            </div>

            {/* Live Sessions Section */}
            {sessions.filter(s => s.status === 'accepted').length > 0 && (
                <div className="mb-8">
                    {/* <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                        <Video className="h-5 w-5 text-green-500" />
                        Live Sessions
                    </h2>
                    <div className="grid gap-4">
                        {sessions.filter(s => s.status === 'accepted').map((session) => (
                            <div
                                key={session._id}
                                className="bg-gradient-to-r from-green-50 to-emerald-50 p-5 rounded-2xl border border-green-200 shadow-sm flex items-center justify-between"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-xl">
                                        👨‍🏫
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">
                                            {session.teacherId?.name || session.teacherId?.email?.split('@')[0]}
                                        </h3>
                                        <p className="text-sm text-gray-500">{session.teacherId?.email}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => navigate(`/video-call/${session.roomId}`)}
                                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
                                >
                                    <Video className="h-5 w-5" />
                                    Join Call
                                </button>
                            </div>
                        ))}
                    </div> */}
                </div>
            )}

            {/* Pending Requests Section */}
            {sessions.filter(s => s.status === 'pending').length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
                        <Clock className="h-5 w-5 text-orange-500" />
                        Pending Requests
                    </h2>
                    <div className="grid gap-3">
                        {sessions.filter(s => s.status === 'pending').map((request) => (
                            <div
                                key={request._id}
                                className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-lg">
                                        ⏳
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900">
                                            {request.teacherId?.name || request.teacherId?.email?.split('@')[0]}
                                        </h3>
                                        <p className="text-sm text-gray-400">{request.teacherId?.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                                        Waiting for teacher...
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Session History Header */}
            <div className="flex items-center gap-2 mb-4">
                <History className="h-5 w-5 text-gray-500" />
                <h2 className="text-xl font-bold text-gray-900">Session History</h2>
            </div>

            {/* Sessions List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Loader2 className="h-10 w-10 animate-spin mb-3" />
                    <p className="font-medium">Loading your sessions...</p>
                </div>
            ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Calendar className="h-12 w-12 mb-4 opacity-30" />
                    <p className="font-medium text-lg">No sessions found</p>
                    <p className="text-sm opacity-60 mt-1">
                        Start by requesting a session with a tutor
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {sessions.map((session) => (
                        <div
                            key={session._id}
                            className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center text-2xl">
                                        👨‍🏫
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">
                                            {session.teacherId?.name || session.teacherId?.email?.split("@")[0]}
                                        </h3>
                                        <p className="text-sm text-gray-400">{session.teacherId?.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {getStatusBadge(session.status)}
                                    {session.status === "accepted" && session.roomId && (
                                        <button
                                            onClick={() => navigate(`/video-call/${session.roomId}`)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                                        >
                                            <Video className="h-4 w-4" />
                                            Join
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Session Details */}
                            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-400 mb-1">Requested</p>
                                    <p className="font-medium text-gray-700">{formatDate(session.createdAt)}</p>
                                </div>
                                {session.startedAt && (
                                    <div>
                                        <p className="text-gray-400 mb-1">Started</p>
                                        <p className="font-medium text-gray-700">{formatDate(session.startedAt)}</p>
                                    </div>
                                )}
                                {session.endedAt && (
                                    <div>
                                        <p className="text-gray-400 mb-1">Ended</p>
                                        <p className="font-medium text-gray-700">{formatDate(session.endedAt)}</p>
                                    </div>
                                )}
                                {session.durationMinutes > 0 && (
                                    <div>
                                        <p className="text-gray-400 mb-1">Duration</p>
                                        <p className="font-medium text-gray-700">{session.durationMinutes} min</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-gray-400 mb-1">Session Fee</p>
                                    <p className="font-medium text-gray-700 flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" />
                                        {((session.sessionPrice || 500) / 100).toFixed(2)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
