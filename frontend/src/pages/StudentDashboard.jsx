import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Home, Compass, Calendar, Wallet, LogOut } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

// Navigation items for sidebar
const navItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "sessions", label: "My Sessions", icon: Calendar },
  { id: "wallet", label: "Wallet", icon: Wallet },
];
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
  const pollingRef = useRef(null);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);
  const [topupAmount, setTopupAmount] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null); // null, 'processing', 'success', 'failed'

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
        // ⭐ Store intentId for verification
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        // ⭐ Open Finternet payment in new tab (user stays on dashboard)
        window.open(res.data.paymentUrl, "_blank");
        setMessage("💳 Complete payment in the new tab. Your balance will update automatically!");
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
          { headers: getAuthHeaders() }
        );

        if (res.data.success && res.data.amountCredited) {
          // ✅ Payment completed!
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPaymentStatus("success");
          setMessage(`✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`);
          setWalletBalance(res.data.newBalance);
          localStorage.removeItem("pendingPaymentIntent");
          return;
        }

        // Update status message
        if (attempts % 8 === 0) { // Update message every 6 seconds
          setMessage(`💳 Waiting for payment... (${Math.floor(attempts * 0.75)}s)`);
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPaymentStatus(null);
          setMessage("⏰ Still waiting for payment. Click 'Add Funds' to check status.");
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
        setMessage(`✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`);
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
          setMessage(`⏳ Payment processing... (${retryCount + 1}/${maxRetries})`);
          pollingRef.current = setTimeout(() => {
            verifyPendingPayment(retryCount + 1);
          }, 2000); // Poll every 2 seconds
        } else {
          setPaymentStatus("failed");
          setMessage("⏰ Payment verification timed out. Please check your transaction history.");
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
        setMessage("❌ " + (err.response?.data?.error || "Verification failed"));
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

    // ⭐ Real-time wallet update listener (premium UX!)
    socket.on("wallet-updated", (data) => {
      console.log("💰 Real-time wallet update received:", data);
      setWalletBalance(data.newBalance);
      setPaymentStatus("success");
      setMessage(`✅ $${data.amount.toFixed(2)} added to your wallet!`);
      setShowTopupModal(false);
      setTopupAmount("");
      // Clear pending payment
      localStorage.removeItem("pendingPaymentIntent");
      // Stop any polling
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

  // Simulate payment completion (DEV ONLY)
  const handleSimulateComplete = async () => {
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (!intentId) return;

    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/simulate-complete`,
        { intentId },
        { headers: getAuthHeaders() }
      );

      if (res.data.success) {
        setPaymentStatus("success");
        setMessage(`✅ $${res.data.amountCredited.toFixed(2)} added to your wallet!`);
        setWalletBalance(res.data.newBalance);
        localStorage.removeItem("pendingPaymentIntent");
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.error || err.message));
    }
  };

  // Check if there's a pending payment
  const hasPendingPayment = localStorage.getItem("pendingPaymentIntent");

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

        {user && <p className="text-gray-600 mb-2">Welcome, {user.email}</p>}

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
          <div className={`p-4 mb-4 rounded-lg ${paymentStatus === "success"
            ? "bg-green-50 border border-green-200"
            : paymentStatus === "failed"
              ? "bg-red-50 border border-red-200"
              : "bg-blue-50 border border-blue-200"
            }`}>
            <p className={`font-medium ${paymentStatus === "success"
              ? "text-green-700"
              : paymentStatus === "failed"
                ? "text-red-700"
                : "text-blue-700"
              }`}>{message}</p>
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
      </main>
    </div>
  );
}
