import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

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
    <div className="p-10 font-sans min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
        <div className="flex gap-4">
          <button
            onClick={() => navigate("/wallet")}
            className="px-5 py-2 cursor-pointer bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            💰 Earnings: ₹{user?.walletBalance || 0}
          </button>
          <button
            onClick={logout}
            className="px-5 py-2 cursor-pointer bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {user && <p className="text-gray-600 mb-4">Welcome, {user.email}</p>}

      {message && <p className="font-bold text-green-500 mb-4">{message}</p>}

      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Pending Meeting Requests
      </h2>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-gray-500">No pending requests</p>
      ) : (
        <ul className="list-none p-0">
          {requests.map((req) => (
            <li
              key={req._id}
              className="p-4 mb-3 bg-orange-50 rounded-lg flex justify-between items-center shadow-sm border border-orange-100"
            >
              <span className="text-gray-700">
                📧 Student: {req.studentId?.email || "Unknown"}
              </span>
              <button
                onClick={() => acceptMeeting(req._id, req.studentId?._id)}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors"
              >
                ✅ Accept Meeting
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
