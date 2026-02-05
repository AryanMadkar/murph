import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Loader2, CheckCircle, Clock, BookOpen } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function TeacherDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("requests");
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const navigate = useNavigate();

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);

  // Get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  // Fetch wallet balance
  const fetchBalance = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/wallet/balance`, {
        headers: getAuthHeaders(),
      });
      if (res.data.success) {
        setWalletBalance(res.data.balance || 0);
      }
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    }
  };

  const fetchDashboardData = async (teacherId) => {
    setLoading(true);
    setMaterialsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [requestsRes, materialsRes] = await Promise.all([
        axios.get(`${API_URL}/api/meetings/pending/${teacherId}`, { headers }),
        axios.get(`${API_URL}/api/materials/teacher`, { headers }),
      ]);

      if (requestsRes.data.success) {
        setRequests(requestsRes.data.meetings || []);
      }
      if (materialsRes.data.success) {
        setMaterials(materialsRes.data.materials || []);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setMessage("Error loading dashboard data: " + err.message);
    } finally {
      setLoading(false);
      setMaterialsLoading(false);
    }
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

    if (!parsedUser || !parsedUser.id) {
      navigate("/login");
      return;
    }
    setUser(parsedUser);

    // Fetch initial data
    fetchBalance();
    socket.emit("register-user", parsedUser.id);
    fetchDashboardData(parsedUser.id);

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
        // Start Attention Session silently
        try {
          await axios.post(`${API_URL}/api/attention/start`, {
            meetingId,
            studentId,
            teacherId: user.id,
            roomId: res.data.roomId,
          });
        } catch (err) {
          console.error("Failed to start attention session:", err);
        }

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

  const declineMeeting = async (meetingId) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings/decline/${meetingId}`,
      );

      if (res.data.success) {
        setMessage("✅ Meeting declined and student refunded.");
        fetchDashboardData(user.id);
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Teacher Dashboard
          </h1>
          {user && (
            <p className="text-gray-500 mt-2 text-lg">
              Welcome back, {user.email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-6">
          {/* Wallet Balance Card */}
          <div
            onClick={() => navigate("/teacher/wallet")}
            className="bg-black text-white px-6 py-4 rounded-2xl shadow-xl cursor-pointer hover:bg-gray-800 transition-all flex flex-col items-center min-w-[140px]"
          >
            <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold mb-1">
              My Earnings
            </p>
            <p className="text-2xl font-black">${walletBalance.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="mb-8 p-4 bg-white border border-gray-100 shadow-sm rounded-xl flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-green-500"></div>
          <p className="font-medium text-gray-800">{message}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab("requests")}
          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${activeTab === "requests"
            ? "bg-black text-white"
            : "bg-white text-gray-400 hover:text-gray-900"
            }`}
        >
          Pending Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab("materials")}
          className={`px-6 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${activeTab === "materials"
            ? "bg-black text-white"
            : "bg-white text-gray-400 hover:text-gray-900"
            }`}
        >
          My Published Content ({materials.length})
        </button>
      </div>

      {/* Content Section */}
      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 min-h-[400px]">
        {activeTab === "requests" ? (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
              Upcoming Requests
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
                      <div className="h-12 w-12 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                        <GraduationCap className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 font-medium mb-0.5">
                          Student
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {req.studentId?.email || "Unknown"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto">
                      <button
                        onClick={() => declineMeeting(req._id)}
                        className="flex-1 sm:flex-none px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-full transition-all hover:bg-gray-50 cursor-pointer"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() =>
                          acceptMeeting(req._id, req.studentId?._id)
                        }
                        className="flex-1 sm:flex-none px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-full transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
                      >
                        Accept Session
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
              Published Materials
            </h2>

            {materialsLoading ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Loading your content...</p>
              </div>
            ) : materials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                <BookOpen className="h-10 w-10 mb-3 opacity-20" />
                <p className="font-medium">No content published yet</p>
                <p className="text-sm opacity-60">
                  Use the Upload page to add your first video or document!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {materials.map((m) => (
                  <div
                    key={m._id}
                    className="p-6 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-200 transition-all group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 bg-white border border-gray-100 px-2 py-1 rounded">
                        {m.type}
                      </span>
                      <span className="font-bold text-gray-900">
                        ${m.priceInDollars.toFixed(2)}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">
                      {m.title}
                    </h3>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-4">
                      {m.description}
                    </p>

                    <div className="mt-auto border-t border-gray-100 pt-4 flex justify-between items-center">
                      <div className="flex gap-4">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400">
                            Sales
                          </p>
                          <p className="font-bold text-gray-900">
                            {m.purchaseCount || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase font-bold text-gray-400">
                            Category
                          </p>
                          <p className="font-bold text-gray-900 text-xs">
                            {m.category}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem("token");
                            const res = await axios.get(
                              `${API_URL}/api/materials/access/${m._id}`,
                              {
                                headers: { Authorization: `Bearer ${token}` },
                              },
                            );
                            if (res.data.success) {
                              window.open(res.data.url, "_blank");
                            }
                          } catch (err) {
                            setMessage(
                              "❌ Failed to access: " +
                              (err.response?.data?.message || err.message),
                            );
                          }
                        }}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400 text-xs font-bold rounded-lg transition-all"
                      >
                        View File
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
