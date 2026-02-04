import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function Wallet() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
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
    fetchWalletData(parsedUser.id);
  }, [navigate]);

  const fetchWalletData = async (userId) => {
    try {
      const res = await axios.get(`${API_URL}/api/payment/balance/${userId}`);
      setBalance(res.data.balance);
      setTransactions(res.data.transactions);

      // Update local storage balance
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      userData.walletBalance = res.data.balance;
      localStorage.setItem("user", JSON.stringify(userData));
    } catch (err) {
      console.error("Error fetching wallet:", err);
    }
  };

  const handleAddMoney = async () => {
    const amountNum = Number(amount);
    if (!amount || amountNum < 1) {
      setMessage("Minimum amount is ₹1");
      return;
    }

    setLoading(true);
    setMessage("Initializing payment...");

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setMessage("❌ Failed to load payment gateway.");
        setLoading(false);
        return;
      }

      const res = await axios.post(`${API_URL}/api/payment/create-intent`, {
        userId: user.id,
        amount: amountNum,
      });

      const options = {
        key: res.data.keyId,
        amount: res.data.amount,
        currency: res.data.currency,
        name: "Student Wallet",
        description: "Add dummy money",
        order_id: res.data.orderId,
        handler: async function (response) {
          try {
            setMessage("Verifying payment...");
            const verifyRes = await axios.post(
              `${API_URL}/api/payment/verify`,
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
            );

            if (verifyRes.data.success) {
              setMessage("✅ Added successfully!");
              setAmount("");
              fetchWalletData(user.id);
            }
          } catch (err) {
            setMessage("❌ Verification failed");
          } finally {
            setLoading(false);
          }
        },
        prefill: { email: user.email },
        theme: { color: "#2563eb" },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      setMessage("❌ Error: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (user?.role === "teacher") navigate("/teacher-dashboard");
    else navigate("/student-dashboard");
  };

  return (
    <div className="p-8 font-sans min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-2xl bg-white p-8 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">My Wallet</h1>
          <button
            onClick={handleBack}
            className="text-blue-500 hover:underline"
          >
            ← Back to Dashboard
          </button>
        </div>

        <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-8 rounded-xl mb-8 shadow-md text-center">
          <p className="text-lg opacity-90">Current Balance</p>
          <h2 className="text-5xl font-bold mt-2">₹ {balance}</h2>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-3">
            Add Funds (Dummy Money)
          </h3>
          <div className="flex gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (₹)"
              className="flex-1 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddMoney}
              disabled={loading}
              className="px-6 py-3 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition"
            >
              {loading ? "Processing..." : "+ Add Money"}
            </button>
          </div>
          {message && (
            <p className="mt-3 font-semibold text-center">{message}</p>
          )}
        </div>

        <div>
          <h3 className="text-xl font-bold mb-4 text-gray-700">
            Transaction History
          </h3>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {transactions.length === 0 ? (
              <p className="text-gray-400 text-center">No transactions yet</p>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx._id}
                  className="flex justify-between p-3 bg-gray-50 border rounded-lg"
                >
                  <div>
                    <p className="font-bold text-gray-700">{tx.type}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-bold ${tx.type === "CREDIT" ? "text-green-600" : "text-red-600"}`}
                    >
                      {tx.type === "CREDIT" ? "+" : "-"} ₹{tx.amount}
                    </p>
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded text-gray-600">
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
