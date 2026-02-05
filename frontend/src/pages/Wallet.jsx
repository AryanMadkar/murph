import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Loader2,
  History,
  Video,
  ArrowLeft,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export default function Wallet() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");


  const navigate = useNavigate();


  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  const verifyPendingPayment = async (intentId) => {
    setMessage("🔄 Verifying your payment...");
    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/verify-topup`,
        { intentId },
        { headers: getAuthHeaders() },
      );

      if (res.data.success) {
        setMessage(`✅ $${res.data.amountCredited} added to your wallet!`);
        localStorage.removeItem("pendingPaymentIntent");
        fetchWalletData();
        setTimeout(() => setMessage(""), 5000);
      }
    } catch (err) {
      console.error("Verification error:", err);
      // Keep intent for retry or let user know
    }
  };

  const fetchWalletData = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/wallet/balance`, {
        headers: getAuthHeaders(),
      });
      if (res.data.success) {
        setBalance(res.data.balance);
      }

      const txRes = await axios.get(`${API_URL}/api/wallet/transactions`, {
        headers: getAuthHeaders(),
      });
      if (txRes.data.success) {
        setTransactions(txRes.data.transactions);
      }
    } catch (err) {
      console.error("Error fetching wallet:", err);
    }
  };

  const handleAddMoney = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum < 1) {
      setMessage("❌ Minimum amount is $1");
      return;
    }

    setLoading(true);
    setMessage("Initializing payment...");

    try {
      const res = await axios.post(
        `${API_URL}/api/wallet/create-topup`,
        { amount: amountNum },
        { headers: getAuthHeaders() },
      );

      if (res.data.success && res.data.paymentUrl) {
        setMessage("✅ Redirecting to payment gateway...");
        // Store intent ID for verification after redirect
        localStorage.setItem("pendingPaymentIntent", res.data.intentId);
        window.location.href = res.data.paymentUrl;
      } else {
        setMessage("❌ Failed to initiate payment");
      }
    } catch (err) {
      setMessage("❌ Error: " + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (!userData) {
      navigate("/login");
      return;
    }

    // Initial fetch
    fetchWalletData();

    // Check for pending payment (after redirect back)
    const intentId = localStorage.getItem("pendingPaymentIntent");
    if (intentId) {
      verifyPendingPayment(intentId);
    }
  }, [navigate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wallet & Transactions</h1>
          <p className="text-gray-500">Manage your funds and view transaction history.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-100 overflow-hidden border border-gray-100">
          {/* Balance Section */}
          <div className="bg-black text-white p-10 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-10 transform translate-x-10 -translate-y-10">
              <WalletIcon className="h-48 w-48" strokeWidth={1} />
            </div>

            <p className="text-gray-400 font-medium uppercase tracking-wider text-sm mb-2">
              Total Balance
            </p>
            <h1 className="text-6xl font-bold tracking-tight mb-8">
              ${balance.toLocaleString("en-US")}
            </h1>

            <div className="w-full max-w-sm flex gap-3 relative z-10">
              <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-1 flex items-center border border-white/10">
                <span className="pl-4 text-gray-400 text-lg">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 w-full font-medium"
                />
              </div>
              <button
                onClick={handleAddMoney}
                disabled={loading}
                className="bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-gray-100 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                )}
                Add Funds
              </button>
            </div>

            {message && (
              <p
                className={`mt-4 text-sm font-medium ${message.includes("❌") ? "text-red-400" : "text-gray-400"}`}
              >
                {message}
              </p>
            )}
          </div>

          {/* Transactions */}
          <div className="p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <History className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
              Transaction History
            </h3>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {transactions.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p>No transactions yet</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx._id}
                    className="group flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`h-12 w-12 rounded-full flex items-center justify-center bg-gray-50 border border-gray-100 ${tx.type === "CREDIT" ? "text-gray-900" : "text-gray-400"}`}
                      >
                        {tx.type === "CREDIT" ? (
                          <Plus className="h-6 w-6" strokeWidth={1.5} />
                        ) : (
                          <Video className="h-5 w-5" strokeWidth={1.5} />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 capitalize">
                          {tx.type === "CREDIT"
                            ? "Funds Added"
                            : "Meeting Payment"}
                        </p>
                        <p className="text-xs text-gray-500 font-medium">
                          {new Date(tx.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            section: "history",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-lg ${tx.type === "CREDIT" ? "text-gray-900" : "text-gray-500"}`}
                      >
                        {tx.type === "CREDIT" ? "+" : "-"}${(tx.amount / 100).toFixed(2)}
                      </p>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${tx.status === "SUCCESS" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"}`}
                      >
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
    </div>
  );
}
