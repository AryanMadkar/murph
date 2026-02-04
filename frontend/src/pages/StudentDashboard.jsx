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
    if (!userData) {
      navigate("/login");
      return;
    }
    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    // Register with socket
    socket.emit("register-user", parsedUser.id);

    // Fetch wallet balance
    fetchBalance();

    // Check if returning from payment
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success" || localStorage.getItem("pendingPaymentIntent")) {
      verifyPendingPayment();
    }

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
  }, [navigate, searchParams]);

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
    localStorage.removeItem("token");
    localStorage.removeItem("pendingPaymentIntent");
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

      {/* 💰 Wallet Section */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          padding: "20px",
          borderRadius: "12px",
          color: "#fff",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>Wallet Balance</p>
          <h2 style={{ margin: "5px 0", fontSize: "32px" }}>${walletBalance.toFixed(2)}</h2>
        </div>
        <button
          onClick={() => setShowTopupModal(true)}
          style={{
            padding: "12px 24px",
            background: "#fff",
            color: "#667eea",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "16px",
          }}
        >
          + Add Money
        </button>
      </div>

      {/* Topup Modal */}
      {showTopupModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowTopupModal(false)}
        >
          <div
            style={{
              background: "#fff",
              padding: "30px",
              borderRadius: "12px",
              width: "350px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 20px" }}>Add Money to Wallet</h3>
            
            {/* Quick amounts */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
              {[5, 10, 25, 50].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopupAmount(amt.toString())}
                  style={{
                    flex: 1,
                    padding: "10px",
                    border: topupAmount === amt.toString() ? "2px solid #667eea" : "1px solid #ddd",
                    borderRadius: "8px",
                    background: topupAmount === amt.toString() ? "#f0f0ff" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  ${amt}
                </button>
              ))}
            </div>

            <input
              type="number"
              placeholder="Or enter custom amount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "16px",
                marginBottom: "15px",
                boxSizing: "border-box",
              }}
            />

            <button
              onClick={handleTopup}
              disabled={walletLoading || !topupAmount}
              style={{
                width: "100%",
                padding: "14px",
                background: walletLoading ? "#ccc" : "#667eea",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: walletLoading ? "not-allowed" : "pointer",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              {walletLoading ? "Processing..." : `Pay $${topupAmount || "0"}`}
            </button>

            <button
              onClick={() => setShowTopupModal(false)}
              style={{
                width: "100%",
                padding: "10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                marginTop: "10px",
                color: "#666",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
