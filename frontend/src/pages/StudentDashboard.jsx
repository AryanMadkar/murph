import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Search, Loader2, User, Video, LogOut } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function StudentDashboard() {
  const [teachers, setTeachers] = useState([]);
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
      const res = await axios.post(`${API_URL}/api/meetings/request`, {
        studentId: user.id,
        teacherId,
      });

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

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("pendingPaymentIntent");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-['Source_Sans_Pro'] pt-28 pb-12 px-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Student Dashboard</h1>
            {user && <p className="text-gray-500 mt-2 text-lg">Welcome back, {user.email}</p>}
          </div>
          <div>
            <button
              onClick={logout}
              className="group flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              Sign out
              <LogOut className="h-4 w-4 opacity-50 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className="mb-8 p-4 bg-white border border-gray-100 shadow-sm rounded-xl flex items-center gap-3 animate-fade-in">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <p className="font-medium text-gray-800">{message}</p>
          </div>
        )}

        {/* Content Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Search className="h-5 w-5 text-gray-400" />
              Find a Tutor
            </h2>
            <span className="text-sm font-medium text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
              {teachers.length} available
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p>Loading available tutors...</p>
            </div>
          ) : teachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl bg-white">
              <User className="h-10 w-10 mb-3 opacity-20" />
              <p className="font-medium">No tutors available right now</p>
              <p className="text-sm opacity-60">Please check back later</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teachers.map((teacher) => (
                <div
                  key={teacher._id}
                  className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center group"
                >
                  <div className="h-20 w-20 rounded-full bg-gray-50 mb-4 flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition-transform duration-300">
                    👨‍🏫
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1 truncate w-full" title={teacher.email}>
                    {teacher.email.split('@')[0]}
                  </h3>
                  <p className="text-sm text-gray-400 mb-6 truncate w-full">
                    {teacher.email}
                  </p>

                  <button
                    onClick={() => requestMeeting(teacher._id)}
                    className="w-full py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-md flex items-center justify-center gap-2 group-hover:bg-blue-600"
                  >
                    <Video className="h-4 w-4" />
                    Request Session
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
