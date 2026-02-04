import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Wallet as WalletIcon, Plus, ArrowUpRight, ArrowDownLeft, Loader2, History } from "lucide-react";

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
        name: "Murph Wallet",
        description: "Add funds to wallet",
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
              setTimeout(() => setMessage(""), 3000);
            }
          } catch (err) {
            setMessage("❌ Verification failed");
          } finally {
            setLoading(false);
          }
        },
        prefill: { email: user.email },
        theme: { color: "#000000" },
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
    <div className="min-h-screen bg-[#FAFAFA] font-['Source_Sans_Pro'] pt-28 pb-12 px-10">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-500 hover:text-black transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-gray-100 overflow-hidden border border-gray-100">

          {/* Balance Section */}
          <div className="bg-black text-white p-10 flex flex-col items-center justify-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-10 transform translate-x-10 -translate-y-10">
              <WalletIcon className="h-48 w-48" />
            </div>

            <p className="text-gray-400 font-medium uppercase tracking-wider text-sm mb-2">Total Balance</p>
            <h1 className="text-6xl font-bold tracking-tight mb-8">
              ₹{balance.toLocaleString('en-IN')}
            </h1>

            <div className="w-full max-w-sm flex gap-3 relative z-10">
              <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-xl p-1 flex items-center border border-white/10">
                <span className="pl-4 text-gray-400 text-lg">₹</span>
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
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                Add Funds
              </button>
            </div>

            {message && (
              <p className={`mt-4 text-sm font-medium ${message.includes("❌") ? "text-red-400" : "text-green-400"}`}>
                {message}
              </p>
            )}
          </div>

          {/* Transactions */}
          <div className="p-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <History className="h-5 w-5 text-gray-400" />
              Transaction History
            </h3>

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {transactions.length === 0 ? (
                <div className="text-center py-10 text-gray-400 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p>No transactions yet</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx._id} className="group flex justify-between items-center p-4 hover:bg-gray-50 rounded-2xl transition-all border border-transparent hover:border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${tx.type === 'CREDIT' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {tx.type === 'CREDIT' ? <ArrowDownLeft className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 capitalize">
                          {tx.type === "CREDIT" ? "Funds Added" : "Meeting Payment"}
                        </p>
                        <p className="text-xs text-gray-500 font-medium">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-lg ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-gray-900'}`}>
                        {tx.type === 'CREDIT' ? '+' : '-'}₹{tx.amount}
                      </p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tx.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
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
