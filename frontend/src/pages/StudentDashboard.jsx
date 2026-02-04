import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function StudentDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
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

  // ⭐ STEP 3 & 4 - Create topup intent and redirect to Finternet payment page
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
        { headers: getAuthHeaders() }
      );

      if (res.data.success && res.data.paymentUrl) {
        // ⭐ Store intentId for verification after redirect
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        // ⭐ Redirect to Finternet payment page
        window.location.href = res.data.paymentUrl;
      } else if (res.data.success && res.data.intentId) {
        // If no paymentUrl, store intent and show message
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

  // ⭐ STEP 5 - Verify payment after redirect back
  const verifyPendingPayment = async () => {
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (!intentId) return;

    setMessage("🔄 Verifying your payment...");
    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/verify-topup`,
        { intentId },
        { headers: getAuthHeaders() }
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

    if (!parsedUser || !parsedUser.id) {
      navigate("/login");
      return;
    }
    setUser(parsedUser);

    // Fetch wallet balance
    fetchBalance();

    // Check for pending payment (after redirect back)
    verifyPendingPayment();

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

    socket.on("meeting-accepted", ({ roomId }) => {
      setMessage("🎉 Meeting accepted! Joining call...");
      setTimeout(() => navigate(`/video-call/${roomId}`), 1500);
    });

    return () => {
      socket.off("meeting-accepted");
    };
  }, [navigate, searchParams]);

  const requestMeeting = async (teacherId) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings/request`,
        { studentId: user.id, teacherId },
        { headers: getAuthHeaders() }
      );

      if (res.data.success) {
        setMessage("✅ Meeting request sent! Waiting for teacher...");
        fetchBalance(); // Refresh balance after booking
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
    <div className="p-10 font-sans min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        <div className="flex gap-4 items-center">
          {/* Wallet Balance Card */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg">
            <p className="text-sm opacity-80">Wallet Balance</p>
            <p className="text-2xl font-bold">${walletBalance.toFixed(2)}</p>
          </div>

          {/* Add Funds Button */}
          <button
            onClick={() => setShowTopupModal(true)}
            className="px-5 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg cursor-pointer transition-colors font-semibold"
          >
            + Add Funds
          </button>

          <button
            onClick={logout}
            className="px-5 py-2 cursor-pointer bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {user && <p className="text-gray-600 mb-2">Welcome, {user.email}</p>}

      {message && (
        <div className="p-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="font-medium text-blue-700">{message}</p>
        </div>
      )}

      {/* Topup Modal */}
      {showTopupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-96">
            <h3 className="text-xl font-bold mb-4">Add Funds to Wallet</h3>
            
            {/* Quick Amount Buttons */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[5, 10, 25, 50].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopupAmount(amt.toString())}
                  className={`py-2 rounded-lg font-semibold transition-colors ${
                    topupAmount === amt.toString()
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
              className="w-full p-3 border rounded-lg mb-4 text-lg"
              min="1"
            />

            <div className="flex gap-3">
              <button
                onClick={handleTopup}
                disabled={walletLoading || !topupAmount}
                className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-lg font-semibold transition-colors"
              >
                {walletLoading ? "Processing..." : `Pay $${topupAmount || "0"}`}
              </button>
              <button
                onClick={() => {
                  setShowTopupModal(false);
                  setTopupAmount("");
                }}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
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

      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Available Teachers
      </h2>

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
                📞 Request Meeting ($5.00)
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
