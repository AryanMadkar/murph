import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Home,
  Compass,
  Calendar,
  Wallet,
  LogOut,
  Clock,
  Video,
  CheckCircle,
  Loader2,
  XCircle,
  BookOpen,
  ArrowRight,
  Plus,
  FileText,
  FileSearch,
  BarChart2,
  PieChart as PieChartIcon,
  Target,
  Activity,
  TrendingUp,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL;

const socket = io(API_URL);

export default function StudentDashboard() {
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [myMaterials, setMyMaterials] = useState([]);
  const [buyingMaterial, setBuyingMaterial] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pollingRef = useRef(null);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);
  const [topupAmount, setTopupAmount] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null); // null, 'processing', 'success', 'failed'

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // Get auth token
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

  // Fetch student sessions and recommendations
  const fetchAppData = async (studentId) => {
    setLoading(true);
    setSessionsLoading(true);
    setRecLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      // Parallel fetch
      const [sessionsRes, recommendationsRes, materialsRes] = await Promise.all(
        [
          axios.get(`${API_URL}/api/meetings/student/${studentId}`, {
            headers,
          }),
          axios.get(`${API_URL}/api/recommendations`, { headers }),
          axios.get(`${API_URL}/api/materials/my-purchases`, { headers }),
        ],
      );

      if (sessionsRes.data.success) {
        setPendingRequests(sessionsRes.data.pendingRequests || []);
        setActiveSessions(sessionsRes.data.activeSessions || []);
      }

      // Fetch Analytics separately to not block main UI
      fetchAnalytics(studentId);

      if (recommendationsRes.data.success) {
        setRecommendations(recommendationsRes.data.recommendations || []);
      }

      if (materialsRes.data.success) {
        setMyMaterials(materialsRes.data.materials || []);
      }
    } catch (err) {
      console.error("Error fetching app data:", err);
      setMessage("Error loading data: " + err.message);
      // Don't show error for library if it's just empty
    } finally {
      setLoading(false);
      setSessionsLoading(false);
      setRecLoading(false);
    }
  };

  const handlePurchaseMaterial = async (materialId, price) => {
    if (walletBalance < price / 100) {
      setMessage("❌ Insufficient balance. Please top up your wallet.");
      return;
    }

    setBuyingMaterial(materialId);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${API_URL}/api/materials/purchase`,
        { materialId },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data.success) {
        setMessage("✅ Purchase successful! Content added to your library.");
        fetchBalance();
        fetchAppData(user._id); // Refresh library and recommendations
      }
    } catch (err) {
      setMessage(
        "❌ Purchase failed: " + (err.response?.data?.message || err.message),
      );
    } finally {
      setBuyingMaterial(null);
    }
  };

  // Create topup intent and redirect to Finternet payment page
  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount < 1) {
      setMessage("❌ Minimum top-up is $1");
      return;
    }

    setWalletLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/create-topup`,
        { amount },
        { headers: getAuthHeaders() },
      );

      if (res.data.success && res.data.paymentUrl) {
        // ⭐ Store intentId for verification
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        // ⭐ Open Finternet payment in new tab (user stays on dashboard)
        window.open(res.data.paymentUrl, "_blank");
        setMessage(
          "💳 Complete payment in the new tab. Your balance will update automatically!",
        );
        setPaymentStatus("processing");
        setShowTopupModal(false);
        setTopupAmount("");
        // ⭐ Start fast polling immediately (every 1.5 seconds)
        startFastPolling(res.data.intentId);
      } else if (res.data.success && res.data.intentId) {
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        setMessage("📝 Payment intent created. Complete payment to add funds.");
        setShowTopupModal(false);
      } else {
        setMessage("❌ Failed to create payment. Please try again.");
      }
    } catch (err) {
      console.error("Topup error:", err.response?.data);
      setMessage("❌ " + (err.response?.data?.error || err.message));
    } finally {
      setWalletLoading(false);
      setShowTopupModal(false);
    }
  };

  // ⭐ Fast polling for instant updates (every 1.5 seconds)
  const startFastPolling = (intentId) => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    let attempts = 0;
    const maxAttempts = 120; // 90 seconds max (120 * 750ms)

    pollingRef.current = setInterval(async () => {
      attempts++;

      try {
        const res = await axios.post(
          `${API_URL}/api/wallet/verify-topup`,
          { intentId },
          { headers: getAuthHeaders() },
        );

        if (res.data.success && res.data.amountCredited) {
          // ✅ Payment completed!
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPaymentStatus("success");
          setMessage(
            `✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`,
          );
          setWalletBalance(res.data.newBalance);
          localStorage.removeItem("pendingPaymentIntent");
          return;
        }

        // Update status message
        if (attempts % 8 === 0) {
          // Update message every 6 seconds
          setMessage(
            `💳 Waiting for payment... (${Math.floor(attempts * 0.75)}s)`,
          );
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPaymentStatus(null);
          setMessage(
            "⏰ Still waiting for payment. Click 'Add Funds' to check status.",
          );
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 750); // Poll every 750ms for instant updates
  };

  // ⭐ STEP 5 - Verify payment after redirect back (with polling for PROCESSING status)
  const verifyPendingPayment = async (retryCount = 0) => {
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (!intentId) return;

    const maxRetries = 30; // Poll for up to 60 seconds (30 * 2s)

    if (retryCount === 0) {
      setPaymentStatus("processing");
      setMessage("🔄 Verifying your payment...");
    }

    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/verify-topup`,
        { intentId },
        { headers: getAuthHeaders() },
      );

      if (res.data.success && res.data.amountCredited) {
        // ✅ Payment completed!
        setPaymentStatus("success");
        setMessage(
          `✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`,
        );
        setWalletBalance(res.data.newBalance);
        localStorage.removeItem("pendingPaymentIntent");

        // Clear polling
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      // Payment still processing - continue polling
      if (res.data.status === "PROCESSING" || res.data.status === "INITIATED") {
        if (retryCount < maxRetries) {
          setMessage(
            `⏳ Payment processing... (${retryCount + 1}/${maxRetries})`,
          );
          pollingRef.current = setTimeout(() => {
            verifyPendingPayment(retryCount + 1);
          }, 2000); // Poll every 2 seconds
        } else {
          setPaymentStatus("failed");
          setMessage(
            "⏰ Payment verification timed out. Please check your transaction history.",
          );
        }
        return;
      }

      // Payment failed or unknown status
      if (res.data.status === "FAILED") {
        setPaymentStatus("failed");
        setMessage("❌ Payment failed. Please try again.");
        localStorage.removeItem("pendingPaymentIntent");
      }
    } catch (err) {
      console.error("Verify error:", err);

      if (retryCount < 5) {
        // Retry on network errors
        pollingRef.current = setTimeout(() => {
          verifyPendingPayment(retryCount + 1);
        }, 2000);
      } else {
        setPaymentStatus("failed");
        setMessage(
          "❌ " + (err.response?.data?.error || "Verification failed"),
        );
      }
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, []);

  // Fetch session history (for My Sessions)
  const fetchHistory = async (studentId) => {
    // setHistoryLoading(true); // Assuming this state exists elsewhere
    try {
      const res = await axios.get(
        `${API_URL}/api/meetings/student/${studentId}/history`,
      );
      if (res.data.success) {
        // setSessionHistory(res.data.sessions); // Assuming this state exists elsewhere
      }
    } catch (err) {
      console.error("Failed to fetch session history:", err);
    } finally {
      // setHistoryLoading(false); // Assuming this state exists elsewhere
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

    if (!parsedUser || !parsedUser._id) {
      navigate("/login");
      return;
    }
    setUser(parsedUser);

    // Initial data fetch
    fetchBalance();
    // fetchAppData(parsedUser._id); // Moved to separate useEffect
    fetchHistory(parsedUser._id);
    verifyPendingPayment();

    // Register with socket
    socket.emit("register-user", parsedUser._id);

    // Fetch teachers list
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

    // Socket listeners
    socket.on("meeting-accepted", ({ roomId }) => {
      setMessage("🎉 Meeting accepted! Joining call...");
      setTimeout(() => navigate(`/video-call/${roomId}`), 1500);
    });

    socket.on("wallet-updated", (data) => {
      console.log("💰 Real-time wallet update received:", data);
      setWalletBalance(data.newBalance);
      setPaymentStatus("success");
      setMessage(`✅ $${data.amount.toFixed(2)} added to your wallet!`);
      setShowTopupModal(false);
      setTopupAmount("");
      localStorage.removeItem("pendingPaymentIntent");
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    });

    return () => {
      socket.off("meeting-accepted");
      socket.off("wallet-updated");
    };
  }, [navigate]);

  useEffect(() => {
    if (user) {
      fetchAppData(user._id);
    }
  }, [user]);

  // Simulate payment completion (DEV ONLY)
  const handleSimulateComplete = async () => {
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (!intentId) return;

    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/simulate-complete`,
        { intentId },
        { headers: getAuthHeaders() },
      );

      if (res.data.success) {
        setPaymentStatus("success");
        setMessage(
          `✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`,
        );
        setWalletBalance(res.data.newBalance);
        localStorage.removeItem("pendingPaymentIntent");
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.error || err.message));
    }
  };

  const cancelMeeting = async (meetingId) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings/cancel`,
        { meetingId }
      );

      if (res.data.success) {
        setMessage("✅ Request cancelled and funds returned to your wallet.");
        fetchBalance();
        fetchAppData(user._id);
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    }
  };

  const fetchAnalytics = async (studentId) => {
    try {
      setAnalyticsLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${API_URL}/api/attention/history/${studentId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.data.success) {
        setAnalyticsData(res.data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Check if there's a pending payment
  const hasPendingPayment = localStorage.getItem("pendingPaymentIntent");


  const chartData = [...analyticsData]
    .reverse()
    .map((session, idx) => ({
      name: `Session ${idx + 1}`,
      focus: Math.round(session.metrics?.averageAttention * 100),
      consistency: Math.round(session.metrics?.consistencyScore * 100),
    }));

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tab Switcher */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit mb-10">
        <button
          onClick={() => setActiveTab("home")}
          className={`px-8 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${activeTab === "home" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-8 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${activeTab === "analytics" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          My Focus Analytics
        </button>
      </div>

      {activeTab === "home" ? (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Greeting */}
          <div className="mb-10">
            <h1 className="text-4xl font-black text-gray-500 leading-tight">
              <span className="text-gray-600">Hi there,</span>{" "}
              {user?.name || user?.email?.split("@")[0] || "User"}!
            </h1>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              Ready to start learning?
            </p>
          </div>

          {user && <p className="text-gray-600 mb-6">Welcome, {user.email}</p>}

          {/* Pending Requests Section */}
          {pendingRequests.length > 0 && (
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                My Pending Requests
              </h2>
              <div className="space-y-4">
                {pendingRequests.map((req) => (
                  <div
                    key={req._id}
                    className="p-6 bg-gray-50 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 transition-all hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                        <User className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 font-medium mb-0.5">
                          Teacher
                        </p>
                        <p className="text-lg font-bold text-gray-900">
                          {req.teacherId?.email || "Unknown"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <span className="px-4 py-2 bg-yellow-50 text-yellow-600 text-xs font-bold rounded-lg border border-yellow-100">
                        Waiting for Response
                      </span>
                      <button
                        onClick={() => cancelMeeting(req._id)}
                        className="px-6 py-3 bg-white border border-gray-200 text-red-500 font-medium rounded-full transition-all hover:bg-red-50 hover:border-red-100 cursor-pointer shadow-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Content Recommendations Section */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 mb-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Compass className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
                Recommended for You
              </h2>
              <span className="text-[10px] bg-gray-900 text-white px-2 py-1 rounded font-black uppercase tracking-widest">
                AI Powered
              </span>
            </div>

            {recLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Finding perfect content...</p>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                <p>No recommendations yet. Tell us about your interests!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {recommendations.map((item) => (
                  <div
                    key={item._id}
                    className="group bg-gray-50 rounded-2xl overflow-hidden border border-transparent hover:border-gray-200 transition-all hover:shadow-lg"
                  >
                    <div className="h-32 bg-gray-200/50 flex items-center justify-center text-3xl">
                      {item.type === "video" ? "🎬" : "📄"}
                    </div>
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                          {item.category}
                        </span>
                        <span className="font-bold text-gray-900">
                          ${item.priceInDollars.toFixed(2)}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 mb-1 line-clamp-1 group-hover:text-black transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-4">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <p className="text-[10px] text-gray-400">
                          By {item.teacherId?.name || "Expert"}
                        </p>
                        <button
                          onClick={() =>
                            handlePurchaseMaterial(item._id, item.price)
                          }
                          disabled={buyingMaterial === item._id}
                          className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-full hover:bg-black transition-all cursor-pointer disabled:bg-gray-300 flex items-center gap-2"
                        >
                          {buyingMaterial === item._id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Buying...
                            </>
                          ) : (
                            "Buy Now"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
              My Purchased Content
            </h2>

            {myMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                <BookOpen className="h-10 w-10 mb-3 opacity-20" strokeWidth={1.5} />
                <p className="font-medium">Library is empty</p>
                <p className="text-sm opacity-60">
                  Buy content from your recommendations to see it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myMaterials.map((item) => (
                  <div
                    key={item._id}
                    className="bg-white rounded-2xl overflow-hidden border border-gray-100 p-5 flex flex-col shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-900 bg-gray-50 border border-gray-100 px-2 py-1 rounded">
                        {item.type}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-4 flex-grow">
                      {item.description}
                    </p>
                    <button
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem("token");
                          const res = await axios.get(
                            `${API_URL}/api/materials/access/${item._id}`,
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
                      className="w-full py-3 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
                    >
                      Access Content
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Processing Banner */}
          {paymentStatus === "processing" && (
            <div className="p-4 mb-4 bg-yellow-50 border border-yellow-300 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-yellow-500 border-t-transparent rounded-full"></div>
                <p className="font-medium text-yellow-700">{message}</p>
              </div>
              <button
                onClick={handleSimulateComplete}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium"
              >
                ⚡ Complete Now (Dev)
              </button>
            </div>
          )}

          {/* Success/Error Message */}
          {message && paymentStatus !== "processing" && (
            <div
              className={`p-4 mb-4 rounded-lg ${paymentStatus === "success"
                ? "bg-green-50 border border-green-200"
                : paymentStatus === "failed"
                  ? "bg-red-50 border border-red-200"
                  : "bg-blue-50 border border-blue-200"
                }`}
            >
              <p
                className={`font-medium ${paymentStatus === "success"
                  ? "text-green-700"
                  : paymentStatus === "failed"
                    ? "text-red-700"
                    : "text-blue-700"
                  }`}
              >
                {message}
              </p>
            </div>
          )}

          {/* Topup Modal */}
          {showTopupModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white p-8 rounded-2xl shadow-xl w-96">
                <h3 className="text-xl font-bold mb-4">Add Funds to Wallet</h3>

                {/* Quick Amount Buttons */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[5, 10, 25, 50].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopupAmount(amt.toString())}
                      className={`py-2 rounded-lg font-semibold transition-colors cursor-pointer ${topupAmount === amt.toString()
                        ? "bg-black text-white"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                        }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                {/* Custom Amount Input */}
                <input
                  type="number"
                  placeholder="Or enter custom amount"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="w-full p-3 border border-gray-200 rounded-lg mb-4 text-lg focus:outline-none focus:border-black"
                  min="1"
                />

                <div className="flex gap-3">
                  <button
                    onClick={handleTopup}
                    disabled={walletLoading || !topupAmount}
                    className="flex-1 py-3 bg-black hover:bg-gray-800 disabled:bg-gray-300 text-white rounded-lg font-semibold transition-colors cursor-pointer"
                  >
                    {walletLoading ? "Processing..." : `Pay $${topupAmount || "0"}`}
                  </button>
                  <button
                    onClick={() => {
                      setShowTopupModal(false);
                      setTopupAmount("");
                    }}
                    className="px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-xs text-gray-500 mt-3 text-center">
                  Powered by Finternet • Secure Payment
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-10">
            <h1 className="text-4xl font-black text-gray-900 leading-tight">
              Focus <span className="text-gray-400">Analytics</span>
            </h1>
            <p className="text-gray-500 mt-2">
              Track your learning journey and attention trends.
            </p>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                label: "Avg Focus Score",
                val:
                  analyticsData.length > 0
                    ? `${(
                      (analyticsData.reduce(
                        (acc, s) => acc + (s.metrics?.averageAttention || 0),
                        0,
                      ) /
                        analyticsData.length) *
                      100
                    ).toFixed(1)}%`
                    : "N/A",
                icon: Target,
                color: "text-blue-500",
                bg: "bg-blue-50",
              },
              {
                label: "Total Sessions",
                val: analyticsData.length,
                icon: Calendar,
                color: "text-gray-900",
                bg: "bg-gray-50",
              },
              {
                label: "Consistency",
                val:
                  analyticsData.length > 0
                    ? `${(
                      (analyticsData.reduce(
                        (acc, s) => acc + (s.metrics?.consistencyScore || 0),
                        0,
                      ) /
                        analyticsData.length) *
                      100
                    ).toFixed(1)}%`
                    : "N/A",
                icon: Activity,
                color: "text-green-500",
                bg: "bg-green-50",
              },
            ].map((stat, i) => (
              <div
                key={i}
                className="bg-white border border-gray-100 p-8 rounded-2xl shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-3 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">
                    {stat.label}
                  </span>
                </div>
                <div className="text-3xl font-black text-gray-900">
                  {stat.val}
                </div>
              </div>
            ))}
          </div>

          {/* Focus Trend Chart */}
          <div className="bg-white border border-gray-100 p-8 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-8 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
              Learning Momentum
            </h2>
            <div className="h-[350px] w-full">
              {analyticsData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <linearGradient
                      id="focusGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#000000"
                        stopOpacity={0.1}
                      />
                      <stop
                        offset="95%"
                        stopColor="#000000"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#f0f0f0"
                    />
                    <XAxis
                      dataKey="name"
                      fontSize={11}
                      tickMargin={10}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: "16px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="focus"
                      stroke="#000000"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#focusGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                  <p>Not enough data for trends yet. Complete more sessions!</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent Session Log */}
          <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">
                Recent Learning Sessions
              </h2>
              <span className="text-xs text-gray-400 font-medium">
                Last 10 sessions
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50/50">
                  <tr>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Date/Time
                    </th>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Focus Score
                    </th>
                    <th className="px-8 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Consistency
                    </th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Analysis
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {analyticsData.map((session) => (
                    <tr
                      key={session._id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-gray-900">
                            {new Date(session.sessionStartTime).toLocaleDateString()}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {new Date(session.sessionStartTime).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${session.metrics?.averageAttention > 0.7 ? "bg-green-500" : session.metrics?.averageAttention > 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{
                                width: `${session.metrics?.averageAttention * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-black text-gray-900">
                            {Math.round(session.metrics?.averageAttention * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm font-medium text-gray-600">
                          {Math.round(session.metrics?.consistencyScore * 100)}%
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button
                          onClick={() =>
                            navigate(`/session-review/${session._id}`)
                          }
                          className="text-gray-900 font-black text-xs hover:text-black underline-offset-4 hover:underline cursor-pointer"
                        >
                          View Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {analyticsData.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-8 py-20 text-center text-gray-400"
                      >
                        No session history found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
