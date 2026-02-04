import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

const API_URL = "https://hobby-affiliated-adds-theology.trycloudflare.com";
const socket = io(API_URL);

export default function StudentDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
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
    navigate("/login");
  };

  return (
    <div className="p-10 font-sans min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        <button
          onClick={logout}
          className="px-5 py-2 cursor-pointer bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
        >
          Logout
        </button>
      </div>

      {user && <p className="text-gray-600 mb-4">Welcome, {user.email}</p>}

      {message && (
        <p className="font-bold text-blue-500 mb-4">{message}</p>
      )}

      <h2 className="text-xl font-semibold text-gray-800 mb-4">Available Teachers</h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : teachers.length === 0 ? (
        <p className="text-gray-500">No teachers available</p>
      ) : (
        <ul className="list-none p-0">
          {teachers.map((teacher) => (
            <li
              key={teacher._id}
              className="p-4 mb-3 bg-white rounded-lg flex justify-between items-center shadow-sm border border-gray-100"
            >
              <span className="text-gray-700">{teacher.email}</span>
              <button
                onClick={() => requestMeeting(teacher._id)}
                className="px-5 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg cursor-pointer transition-colors"
              >
                📞 Request Meeting
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
