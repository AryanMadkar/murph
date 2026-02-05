import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import {
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
  Sparkles,
  Home,
  Loader2,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export default function SessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [tips, setTips] = useState("");
  const [aiData, setAiData] = useState({ notes: "", transcription: "" });
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

        // Fetch AI Notes & Transcription if meetingId exists
        if (sessionRes.data.session?.meetingId) {
          try {
            const notesRes = await axios.get(
              `${API_URL}/api/meetings/session-notes/${sessionRes.data.session.meetingId}`,
            );
            if (notesRes.data.success) {
              setAiData({
                notes: notesRes.data.notes,
                transcription: notesRes.data.transcription,
              });
            }
          } catch (e) {
            console.warn("AI Notes not found (yet):", e.message);
          }
        }
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
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 font-['Source_Sans_Pro']">
        <Loader2 className="w-10 h-10 text-gray-900 animate-spin mb-4" strokeWidth={1.5} />
        <p className="text-gray-900 font-bold uppercase tracking-widest text-[10px]">Gathering AI Insights...</p>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 font-['Source_Sans_Pro']">
        <AlertTriangle className="w-12 h-12 text-gray-900 mb-4" strokeWidth={1.5} />
        <h2 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-wide">Error Loading Data</h2>
        <p className="text-gray-500 text-center mb-6 font-medium">{error}</p>
        <button
          onClick={() => navigate("/teacher-dashboard")}
          className="px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-full transition-all shadow-md hover:shadow-lg cursor-pointer"
        >
          Go to Dashboard
        </button>
      </div>
    );

  const chartData =
    session.attentionScores?.map((s, idx) => ({
      frame: idx,
      score: (s.score * 100).toFixed(1),
      time: new Date(s.timestamp).toLocaleTimeString([], { second: "2-digit" }),
    })) || [];

  const getGradeColor = (grade) => {
    switch (grade) {
      case "Excellent": return "bg-gray-900 text-white border-transparent shadow-lg";
      case "Good": return "bg-gray-100 text-gray-900 border-gray-200";
      case "Fair": return "bg-gray-50 text-gray-500 border-gray-200";
      default: return "bg-white text-gray-400 border-gray-100";
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-['Source_Sans_Pro'] p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-900 transition-all cursor-pointer group"
            >
              <ArrowLeft className="w-5 h-5 text-gray-900 transition-transform group-hover:-translate-x-1" strokeWidth={1.5} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                Session Review
              </h1>
              <p className="text-gray-500 mt-1">AI-powered attention analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-xl text-[10px] tracking-widest uppercase font-black border flex items-center gap-2 ${getGradeColor(session.metrics?.engagementGrade)}`}>
              <Activity className="w-4 h-4" strokeWidth={1.5} />
              {session.metrics?.engagementGrade || "N/A"}
            </div>
            <button
              onClick={() => navigate("/teacher-dashboard")}
              className="px-8 py-3 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-widest rounded-full transition-all shadow-xl hover:-translate-y-0.5 cursor-pointer flex items-center gap-2"
            >
              <Home className="w-4 h-4" strokeWidth={1.5} />
              Dashboard
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            {
              label: "Avg Attention",
              val: `${(session.metrics?.averageAttention * 100).toFixed(1)}%`,
              icon: Target,
              color: "text-blue-500",
              bg: "bg-blue-50",
            },
            {
              label: "Consistency",
              val: `${(session.metrics?.consistencyScore * 100).toFixed(1)}%`,
              icon: Activity,
              color: "text-gray-900",
              bg: "bg-gray-50",
            },
            {
              label: "Duration",
              val: `${session.sessionDuration}s`,
              icon: TrendingUp,
              color: "text-green-500",
              bg: "bg-green-50",
            },
            {
              label: "Max Focus",
              val: `${(session.metrics?.maxAttention * 100).toFixed(1)}%`,
              icon: Brain,
              color: "text-gray-400",
              bg: "bg-gray-50",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm"
            >
              <div className="flex justify-between items-start mb-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                  {stat.label}
                </p>
                <div className={`p-2 rounded-lg bg-gray-50 border border-gray-100 shadow-sm`}>
                  <stat.icon className={`w-4 h-4 text-gray-900`} strokeWidth={1.5} />
                </div>
              </div>
              <div className="text-2xl font-black text-gray-900">{stat.val}</div>
            </div>
          ))}
        </div>

        {/* Charts and Tips */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Attention Timeline */}
          <div className="lg:col-span-2 bg-white border border-gray-100 p-8 rounded-2xl shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <TrendingUp className="text-gray-900 w-5 h-5" />
              Attention Timeline
            </h2>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f0f0f0"
                    vertical={false}
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis stroke="#d1d5db" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="#000000"
                    strokeWidth={2}
                    fillOpacity={0.05}
                    fill="#000000"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Teaching Tips */}
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl flex flex-col text-white">
            <h2 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-widest text-white">
              <Sparkles className="w-5 h-5 text-white" strokeWidth={1.5} />
              Teaching Tips
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 text-gray-300 text-sm leading-relaxed whitespace-pre-line max-h-[250px] font-medium">
              {tips || "No tips available for this session."}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 text-[10px] text-white/50 text-center uppercase tracking-widest font-black">
              Powered by Groq • AI Pedagogical Coach
            </div>
          </div>
        </div>

        {/* AI Notes and Transcription */}
        {(aiData.notes || aiData.transcription) && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {aiData.notes && (
              <div className="bg-white border border-gray-100 p-8 rounded-2xl shadow-sm">
                <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2 uppercase tracking-widest">
                  <Brain className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
                  AI Session Summary
                </h2>
                <div className="text-gray-500 text-sm leading-relaxed whitespace-pre-line">
                  {aiData.notes}
                </div>
              </div>
            )}
            {aiData.transcription && (
              <div className="bg-white border border-gray-100 p-8 rounded-2xl shadow-sm">
                <h2 className="text-lg font-black text-gray-900 mb-6 flex items-center gap-2 uppercase tracking-widest">
                  <Activity className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
                  Key Transcription
                </h2>
                <div className="text-gray-500 text-sm leading-relaxed max-h-[300px] overflow-y-auto italic pr-2 custom-scrollbar">
                  "{aiData.transcription}"
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
