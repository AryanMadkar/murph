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
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    // Register with socket
    socket.emit("register-user", parsedUser.id);

    // Fetch pending requests
    fetchRequests(parsedUser.id);

    // Listen for new meeting requests
    socket.on("new-meeting-request", ({ studentEmail, meetingId }) => {
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

        // Notify student via socket
        socket.emit("meeting-accepted", {
          studentId,
          roomId: res.data.roomId,
        });

        // Navigate to video call
        setTimeout(() => navigate(`/call/${res.data.roomId}`), 1000);
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
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Teacher Dashboard</h1>
        <button
          onClick={logout}
          style={{ padding: "10px 20px", cursor: "pointer" }}
        >
          Logout
        </button>
      </div>

      {user && <p>Welcome, {user.email}</p>}

      {message && (
        <p style={{ fontWeight: "bold", color: "#4CAF50" }}>{message}</p>
      )}

      <h2>Pending Meeting Requests</h2>

      {loading ? (
        <p>Loading...</p>
      ) : requests.length === 0 ? (
        <p>No pending requests</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {requests.map((req) => (
            <li
              key={req._id}
              style={{
                padding: "15px",
                marginBottom: "10px",
                background: "#fff3e0",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>📧 Student: {req.studentId?.email || "Unknown"}</span>
              <button
                onClick={() => acceptMeeting(req._id, req.studentId?._id)}
                style={{
                  padding: "10px 20px",
                  background: "#2196F3",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
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
