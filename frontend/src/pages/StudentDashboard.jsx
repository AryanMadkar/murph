import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Home,
  Search,
  User,
  Wallet,
  Plus,
  Image,
  Send,
  LogOut,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function StudentDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [chatInput, setChatInput] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);
  const [topupAmount, setTopupAmount] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);

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
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        window.location.href = res.data.paymentUrl;
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

  // Verify payment after redirect back
  const verifyPendingPayment = async () => {
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (!intentId) return;

    setMessage("🔄 Verifying your payment...");
    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/verify-topup`,
        { intentId },
        { headers: getAuthHeaders() },
      );

      if (res.data.success) {
        setMessage(`✅ $${res.data.amountCredited} added to your wallet!`);
        setWalletBalance(res.data.newBalance);
        localStorage.removeItem("pendingPaymentIntent");
        fetchBalance();
      } else if (res.data.status === "PENDING") {
        setMessage("⏳ Payment still processing...");
      }
    } catch (err) {
      if (err.response?.data?.error === "Payment failed") {
        setMessage("❌ Payment was not completed.");
        localStorage.removeItem("pendingPaymentIntent");
      } else {
        setMessage("⏳ Payment verification pending...");
      }
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

    // Fetch wallet balance
    fetchBalance();

    // Check for pending payment (after redirect back)
    verifyPendingPayment();

    // Register with socket
    socket.emit("register-user", parsedUser._id);

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
      const res = await axios.post(
        `${API_URL}/api/meetings/request`,
        { studentId: user._id, teacherId },
        { headers: getAuthHeaders() },
      );

      if (res.data.success) {
        setMessage("✅ Meeting request sent! Waiting for teacher...");
        fetchBalance();
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

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "explore", label: "Explore", icon: Search },
    { id: "sessions", label: "My Sessions", icon: User },
    { id: "wallet", label: "Wallet", icon: Wallet },
  ];

  return (
    <div className="flex min-h-screen bg-[#F5F5F5] font-['Source_Sans_Pro']">
      {/* Left Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-100 flex flex-col fixed h-full">
        {/* Logo */}
        <div className="p-6 pb-4">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Murph
          </h1>
        </div>

        {/* Profile Section */}
        <div className="px-6 py-4 flex flex-col items-center border-b border-gray-100">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium mb-2">
            Profile
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {user?.name || user?.email?.split("@")[0] || "Username"}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === "wallet") {
                      navigate("/wallet");
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === item.id
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-56 p-10">
        {/* Greeting */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900">
            <span className="text-purple-600">Hi there,</span>{" "}
            {user?.name || user?.email?.split("@")[0] || "User"}!
          </h1>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            Ready to start learning?
          </p>
        </div>

        {/* Status Message */}
        {message && (
          <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
            <p className="font-medium text-gray-800">{message}</p>
          </div>
        )}

        {/* Chat Input Box */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden max-w-3xl">
          <textarea
            placeholder="Ask me anything about your learning journey..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="w-full p-6 text-gray-700 placeholder-gray-400 resize-none focus:outline-none min-h-[200px] text-lg"
            maxLength={1000}
          />

          {/* Input Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors">
                <Plus className="w-4 h-4" />
                Add Attachment
              </button>
              <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors">
                <Image className="w-4 h-4" />
                Use Image
              </button>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                {chatInput.length}/1000
              </span>
              <button
                className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!chatInput.trim()}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Available Teachers Section (When Explore is active) */}
        {activeTab === "explore" && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Available Teachers
            </h2>

            {loading ? (
              <p className="text-gray-500">Loading...</p>
            ) : teachers.length === 0 ? (
              <p className="text-gray-500">No teachers available</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teachers.map((teacher) => (
                  <div
                    key={teacher._id}
                    className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-xl">
                        👨‍🏫
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {teacher.name || teacher.email?.split("@")[0]}
                        </p>
                        <p className="text-sm text-gray-500">{teacher.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => requestMeeting(teacher._id)}
                      className="w-full py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors"
                    >
                      Request Session ($5.00)
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

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
                      ? "bg-purple-600 text-white"
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
              className="w-full p-3 border border-gray-200 rounded-lg mb-4 text-lg focus:outline-none focus:border-purple-500"
              min="1"
            />

            <div className="flex gap-3">
              <button
                onClick={handleTopup}
                disabled={walletLoading || !topupAmount}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg font-semibold transition-colors cursor-pointer"
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
  );
}
