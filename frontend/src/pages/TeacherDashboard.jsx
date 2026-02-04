import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Loader2, CheckCircle, Clock } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function TeacherDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

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

    if (!parsedUser || !parsedUser.id) {
      navigate("/login");
      return;
    }
    setUser(parsedUser);

    socket.emit("register-user", parsedUser.id);

    fetchRequests(parsedUser.id);

    socket.on("new-meeting-request", ({ studentEmail }) => {
      setMessage(`🔔 New meeting request from ${studentEmail}`);
      fetchRequests(parsedUser.id);
    });

    return () => {
      socket.off("new-meeting-request");
    };
  }, [navigate]);

  const fetchRequests = (teacherId) => {
    axios
      .get(`${API_URL}/api/meetings/pending/${teacherId}`)
      .then((res) => {
        setRequests(res.data.meetings);
        setLoading(false);
      })
      .catch((err) => {
        setMessage("Error loading requests: " + err.message);
        setLoading(false);
      });
  };

  const acceptMeeting = async (meetingId, studentId) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings/accept/${meetingId}`,
      );

      if (res.data.success) {
        setMessage("✅ Meeting accepted! Starting call...");

        socket.emit("meeting-accepted", {
          studentId,
          roomId: res.data.roomId,
        });

        setTimeout(() => navigate(`/video-call/${res.data.roomId}`), 1000);
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-['Source_Sans_Pro'] pt-28 pb-12 px-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Teacher Dashboard</h1>
            {user && <p className="text-gray-500 mt-2 text-lg">Welcome back, {user.email}</p>}
          </div>
          <div>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className="mb-8 p-4 bg-white border border-gray-100 shadow-sm rounded-xl flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <p className="font-medium text-gray-800">{message}</p>
          </div>
        )}

        {/* Content Section */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 min-h-[400px]">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-400" />
            Pending Requests
          </h2>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p>Loading requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
              <CheckCircle className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium">No pending requests</p>
              <p className="text-sm opacity-60">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => (
                <div
                  key={req._id}
                  className="p-6 bg-gray-50 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 transition-all hover:bg-gray-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-xl shadow-sm">
                      🎓
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 font-medium mb-0.5">Student</p>
                      <p className="text-lg font-bold text-gray-900">{req.studentId?.email || "Unknown"}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => acceptMeeting(req._id, req.studentId?._id)}
                    className="w-full sm:w-auto px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-full transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
                  >
                    Accept Session
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
