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

    // Register with socket
    socket.emit("register-user", parsedUser.id);

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
      setTimeout(() => navigate(`/call/${roomId}`), 1500);
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
        // Also emit socket event for real-time notification
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
    <div style={{ padding: "40px", fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Student Dashboard</h1>
        <button
          onClick={logout}
          style={{ padding: "10px 20px", cursor: "pointer" }}
        >
          Logout
        </button>
      </div>

      {user && <p>Welcome, {user.email}</p>}

      {message && (
        <p style={{ fontWeight: "bold", color: "#2196F3" }}>{message}</p>
      )}

      <h2>Available Teachers</h2>

      {loading ? (
        <p>Loading...</p>
      ) : teachers.length === 0 ? (
        <p>No teachers available</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {teachers.map((teacher) => (
            <li
              key={teacher._id}
              style={{
                padding: "15px",
                marginBottom: "10px",
                background: "#f5f5f5",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{teacher.email}</span>
              <button
                onClick={() => requestMeeting(teacher._id)}
                style={{
                  padding: "10px 20px",
                  background: "#4CAF50",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
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
