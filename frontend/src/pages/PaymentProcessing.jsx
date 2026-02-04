import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function PaymentProcessing() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  
  const intentId = params.get("intent");
  const paymentUrl = decodeURIComponent(params.get("url") || "");
  
  const [status, setStatus] = useState("waiting"); // waiting, verifying, success, failed
  const [message, setMessage] = useState("Complete your payment in the opened tab");
  const [retryCount, setRetryCount] = useState(0);
  const pollingRef = useRef(null);
  const hasOpenedPayment = useRef(false);

  // Get auth token
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  // Get user for socket registration
  const getUser = () => {
    try {
      const userData = localStorage.getItem("user");
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    // Validate we have required params
    if (!intentId || !paymentUrl) {
      setStatus("failed");
      setMessage("❌ Invalid payment session. Please try again.");
      return;
    }

    // Save intent locally (for recovery if page refreshes)
    localStorage.setItem("pendingPaymentIntent", intentId);

    // Register user with socket for real-time updates
    const user = getUser();
    if (user?.id) {
      socket.emit("register-user", user.id);
    }

    // Open Finternet payment in new tab (only once)
    if (!hasOpenedPayment.current) {
      hasOpenedPayment.current = true;
      window.open(paymentUrl, "_blank");
    }

    // Listen for real-time wallet update (instant success!)
    socket.on("wallet-updated", (data) => {
      console.log("💰 Real-time payment confirmation:", data);
      setStatus("success");
      setMessage(`✅ $${data.amount.toFixed(2)} added to your wallet!`);
      localStorage.removeItem("pendingPaymentIntent");
      
      // Stop polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate("/student-dashboard");
      }, 2000);
    });

    // Start auto-polling for payment verification
    startPolling();

    return () => {
      socket.off("wallet-updated");
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [intentId, paymentUrl, navigate]);

  // Auto-poll payment verification every 5 seconds
  const startPolling = () => {
    if (pollingRef.current) return;
    
    pollingRef.current = setInterval(() => {
      verifyPayment(true); // silent verification
    }, 5000);
  };

  // Verify payment with backend
  const verifyPayment = async (silent = false) => {
    if (!silent) {
      setStatus("verifying");
      setMessage("🔄 Verifying your payment...");
    }

    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/verify-topup`,
        { intentId },
        { headers: getAuthHeaders() }
      );

      if (res.data.success && res.data.credited) {
        // Payment verified and credited!
        setStatus("success");
        setMessage(`✅ $${res.data.amount?.toFixed(2) || ""} added to your wallet!`);
        localStorage.removeItem("pendingPaymentIntent");
        
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }

        // Redirect to dashboard
        setTimeout(() => {
          navigate("/student-dashboard");
        }, 2000);
      } else if (res.data.status === "PENDING" || res.data.status === "CREATED") {
        // Still waiting for payment
        if (!silent) {
          setStatus("waiting");
          setMessage("⏳ Payment not completed yet. Please complete payment in the opened tab.");
        }
      } else if (res.data.alreadyCredited) {
        // Already processed (duplicate protection)
        setStatus("success");
        setMessage("✅ Payment already processed!");
        localStorage.removeItem("pendingPaymentIntent");
        setTimeout(() => navigate("/student-dashboard"), 2000);
      }
    } catch (err) {
      console.error("Verification error:", err);
      if (!silent) {
        setRetryCount(prev => prev + 1);
        setStatus("waiting");
        setMessage("⚠️ Could not verify payment. Click 'I Completed Payment' to retry.");
      }
    }
  };

  // Manual verification (when user clicks button)
  const handleManualVerify = () => {
    verifyPayment(false);
  };

  // Reopen payment tab
  const reopenPaymentTab = () => {
    if (paymentUrl) {
      window.open(paymentUrl, "_blank");
    }
  };

  // Cancel and go back
  const handleCancel = () => {
    localStorage.removeItem("pendingPaymentIntent");
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    navigate("/student-dashboard");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>💳</div>
          <h1 style={styles.title}>Payment Processing</h1>
        </div>

        {/* Status Icon */}
        <div style={styles.statusContainer}>
          {status === "waiting" && (
            <div style={styles.pulsingDot}>
              <div style={styles.pulse}></div>
              <div style={styles.dot}>⏳</div>
            </div>
          )}
          {status === "verifying" && (
            <div style={styles.spinner}>🔄</div>
          )}
          {status === "success" && (
            <div style={styles.successIcon}>✅</div>
          )}
          {status === "failed" && (
            <div style={styles.failedIcon}>❌</div>
          )}
        </div>

        {/* Message */}
        <p style={styles.message}>{message}</p>

        {/* Instructions */}
        {status === "waiting" && (
          <div style={styles.instructions}>
            <p>📋 <strong>Instructions:</strong></p>
            <ul style={styles.list}>
              <li>Complete payment in the opened Finternet tab</li>
              <li>Return here after payment</li>
              <li>Your wallet will be credited automatically</li>
            </ul>
            <p style={styles.note}>
              🔒 <em>Do not close this page until payment is verified</em>
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.actions}>
          {status === "waiting" && (
            <>
              <button style={styles.primaryBtn} onClick={handleManualVerify}>
                ✅ I Completed Payment
              </button>
              <button style={styles.secondaryBtn} onClick={reopenPaymentTab}>
                🔗 Reopen Payment Tab
              </button>
              <button style={styles.cancelBtn} onClick={handleCancel}>
                ← Cancel & Return
              </button>
            </>
          )}

          {status === "verifying" && (
            <p style={styles.verifyingText}>Please wait...</p>
          )}

          {status === "success" && (
            <p style={styles.successText}>Redirecting to dashboard...</p>
          )}

          {status === "failed" && (
            <button style={styles.primaryBtn} onClick={handleCancel}>
              ← Return to Dashboard
            </button>
          )}
        </div>

        {/* Auto-poll indicator */}
        {status === "waiting" && (
          <p style={styles.autoCheck}>
            🔄 Auto-checking payment status every 5 seconds...
          </p>
        )}

        {/* Retry count */}
        {retryCount > 0 && (
          <p style={styles.retryInfo}>
            Verification attempts: {retryCount}
          </p>
        )}
      </div>

      {/* CSS Animation for pulse effect */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "20px",
    padding: "40px",
    maxWidth: "500px",
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    textAlign: "center",
  },
  header: {
    marginBottom: "30px",
  },
  logo: {
    fontSize: "60px",
    marginBottom: "10px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    color: "#333",
    margin: 0,
  },
  statusContainer: {
    height: "80px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "20px",
  },
  pulsingDot: {
    position: "relative",
    width: "60px",
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    background: "#667eea",
    animation: "pulse 2s infinite",
  },
  dot: {
    fontSize: "40px",
    zIndex: 1,
  },
  spinner: {
    fontSize: "50px",
    animation: "spin 1s linear infinite",
  },
  successIcon: {
    fontSize: "60px",
  },
  failedIcon: {
    fontSize: "60px",
  },
  message: {
    fontSize: "18px",
    color: "#333",
    marginBottom: "20px",
    fontWeight: "500",
  },
  instructions: {
    background: "#f8f9fa",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "25px",
    textAlign: "left",
  },
  list: {
    margin: "10px 0",
    paddingLeft: "20px",
    color: "#555",
  },
  note: {
    fontSize: "14px",
    color: "#666",
    marginTop: "15px",
    marginBottom: 0,
  },
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  primaryBtn: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white",
    border: "none",
    padding: "15px 30px",
    borderRadius: "10px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  secondaryBtn: {
    background: "#f0f0f0",
    color: "#333",
    border: "none",
    padding: "12px 25px",
    borderRadius: "10px",
    fontSize: "14px",
    cursor: "pointer",
  },
  cancelBtn: {
    background: "transparent",
    color: "#999",
    border: "1px solid #ddd",
    padding: "10px 20px",
    borderRadius: "10px",
    fontSize: "14px",
    cursor: "pointer",
  },
  verifyingText: {
    color: "#667eea",
    fontWeight: "bold",
  },
  successText: {
    color: "#28a745",
    fontWeight: "bold",
  },
  autoCheck: {
    fontSize: "13px",
    color: "#888",
    marginTop: "20px",
  },
  retryInfo: {
    fontSize: "12px",
    color: "#aaa",
    marginTop: "10px",
  },
};
