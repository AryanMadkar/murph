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
      setWalletBalance(res.data.data.balanceInDollars);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    }
  };

  // ⭐ STEP 3 & 4 - Create topup intent and redirect to payment
  const handleTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount < 1) {
      setMessage("❌ Minimum top-up is $1");
      return;
    }

    setWalletLoading(true);
    try {
      // Step 3: Create payment intent
      const res = await axios.post(
        `${API_URL}/api/wallet/create-topup`,
        { amount },
        { headers: getAuthHeaders() }
      );

      if (res.data.success && res.data.data.paymentUrl) {
        // Store intentId for verification after redirect
        localStorage.setItem("pendingPaymentIntent", res.data.data.intentId);
        
        // Step 4: Redirect to Finternet payment page
        window.location.href = res.data.data.paymentUrl;
      } else {
        setMessage("❌ Failed to create payment. Please try again.");
      }
    } catch (err) {
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
        setMessage(`✅ $${res.data.data.amountCredited} added to your wallet!`);
        setWalletBalance(res.data.data.newBalance);
        localStorage.removeItem("pendingPaymentIntent");
      } else if (res.data.status === "PENDING") {
        setMessage("⏳ Payment still processing. We'll update your balance soon.");
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
      socket.off("connect", registerSocket);
    };
  }, [navigate, searchParams]);

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
    <div className="p-10 font-sans min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Student Dashboard</h1>
        <div className="flex gap-4">
          {/* Wallet Removed */}
          <button
            onClick={logout}
            className="px-5 py-2 cursor-pointer bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {user && <p>Welcome, {user.email}</p>}

      {message && <p className="font-bold text-blue-500 mb-4">{message}</p>}

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
                📞 Request Meeting
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
