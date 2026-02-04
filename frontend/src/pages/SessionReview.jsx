import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  Brain,
  Target,
  Activity,
  TrendingUp,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL;

export default function SessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [tips, setTips] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const sessionRes = await axios.get(
          `${API_URL}/api/attention/session/${sessionId}`,
        );
        setSession(sessionRes.data.session);

        const tipsRes = await axios.post(`${API_URL}/api/insights/generate`, {
          sessionId,
        });
        setTips(tipsRes.data.tips);
      } catch (err) {
        setError(
          err.response?.data?.message || "Failed to load session analysis.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [sessionId]);

  if (loading)
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-blue-400">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="animate-pulse">Gathering AI Insights...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
        <p className="text-gray-400 text-center mb-6">{error}</p>
        <button
          onClick={() => navigate("/")}
          className="bg-gray-800 px-6 py-2 rounded-lg"
        >
          Back Home
        </button>
      </div>
    );

  const chartData =
    session.attentionScores?.map((s, idx) => ({
      frame: idx,
      score: (s.score * 100).toFixed(1),
      time: new Date(s.timestamp).toLocaleTimeString([], { second: "2-digit" }),
    })) || [];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="p-2 bg-gray-900 rounded-lg border border-gray-800"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent italic">
              Session Review
            </h1>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/50 px-4 py-1 rounded-full text-blue-400 text-sm font-bold flex items-center gap-2">
            <Activity className="w-4 h-4" /> {session.metrics?.engagementGrade}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            {
              label: "Avg Attention",
              val: `${(session.metrics?.averageAttention * 100).toFixed(1)}%`,
              icon: Target,
              color: "text-blue-500",
            },
            {
              label: "Consistency",
              val: `${(session.metrics?.consistencyScore * 100).toFixed(1)}%`,
              icon: Activity,
              color: "text-purple-500",
            },
            {
              label: "Duration",
              val: `${session.sessionDuration}s`,
              icon: TrendingUp,
              color: "text-emerald-500",
            },
            {
              label: "Max Focus",
              val: `${(session.metrics?.maxAttention * 100).toFixed(1)}%`,
              icon: Brain,
              color: "text-pink-500",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-gray-900 border border-gray-800 p-6 rounded-2xl"
            >
              <div className="flex justify-between items-start mb-2 text-gray-400 uppercase text-xs font-bold tracking-wider">
                {stat.label} <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold">{stat.val}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 p-8 rounded-2xl h-[400px]">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <TrendingUp className="text-blue-400" /> Attention Timeline
            </h2>
            <div className="h-full pb-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1f2937"
                    vertical={false}
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="#4b5563" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111827",
                      border: "1px solid #374151",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl flex flex-col h-[400px]">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2 text-emerald-400">
              <Sparkles className="w-5 h-5" /> Teaching Tips
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {tips}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 text-[10px] text-gray-500 text-center">
              Powered by Groq • AI Pedagogical Coach
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
