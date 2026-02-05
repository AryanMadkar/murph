import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  Sparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Download,
  Share2,
  Clock,
  BookOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Lightbulb,
  GraduationCap,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

// Suggested topics for quick start
const SUGGESTED_TOPICS = [
  "Photosynthesis",
  "Newton's Laws of Motion",
  "The French Revolution",
  "DNA and Genetics",
  "Machine Learning Basics",
  "Climate Change",
  "The Solar System",
  "World War II",
];

export default function VirtualTeacher() {
  const [topic, setTopic] = useState("");
  const [lesson, setLesson] = useState(null);
  const [status, setStatus] = useState("idle"); // idle, generating, completed, error
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [myLessons, setMyLessons] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const videoRef = useRef(null);
  const pollInterval = useRef(null);
  const navigate = useNavigate();

  // Get auth token
  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  // Fetch user's past lessons
  const fetchMyLessons = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/virtual-teacher/my-lessons`, {
        headers: getAuthHeaders(),
      });
      if (res.data.success) {
        setMyLessons(res.data.lessons || []);
      }
    } catch (err) {
      console.error("Failed to fetch lessons:", err);
    }
  };

  useEffect(() => {
    fetchMyLessons();
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  // Generate new lesson
  const handleGenerate = async () => {
    if (!topic.trim() || topic.trim().length < 3) {
      setError("Please enter a topic (at least 3 characters)");
      return;
    }

    setError("");
    setStatus("generating");
    setStatusMessage("Starting lesson generation...");
    setLesson(null);

    try {
      const res = await axios.post(
        `${API_URL}/api/virtual-teacher/generate`,
        { topic: topic.trim() },
        { headers: getAuthHeaders() },
      );

      if (res.data.success) {
        if (res.data.cached) {
          // Found cached lesson
          setLesson(res.data.lesson);
          setStatus("completed");
          setStatusMessage("Found cached lesson!");
        } else {
          // Start polling for status
          const lessonId = res.data.lesson._id;
          setStatusMessage("Generating educational script...");
          startPolling(lessonId);
        }
      } else {
        setStatus("error");
        setError(res.data.error || "Failed to start generation");
      }
    } catch (err) {
      setStatus("error");
      setError(err.response?.data?.error || err.message);
    }
  };

  // Poll for lesson status
  const startPolling = (lessonId) => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }

    let attempts = 0;
    const maxAttempts = 120; // 4 minutes max

    pollInterval.current = setInterval(async () => {
      attempts++;

      try {
        const res = await axios.get(
          `${API_URL}/api/virtual-teacher/status/${lessonId}`,
          { headers: getAuthHeaders() },
        );

        if (res.data.success) {
          const lessonStatus = res.data.status;

          // Update status message based on stage
          switch (lessonStatus) {
            case "generating_script":
              setStatusMessage("🧠 AI is writing the lesson script...");
              break;
            case "generating_audio":
              setStatusMessage("🎙️ Converting script to natural speech...");
              break;
            case "generating_video":
              setStatusMessage(
                "🎬 Creating avatar video (this takes ~1-2 min)...",
              );
              break;
            case "completed":
              clearInterval(pollInterval.current);
              pollInterval.current = null;
              // Fetch full lesson
              const fullRes = await axios.get(
                `${API_URL}/api/virtual-teacher/lesson/${lessonId}`,
                { headers: getAuthHeaders() },
              );
              if (fullRes.data.success) {
                setLesson(fullRes.data.lesson);
                setStatus("completed");
                setStatusMessage("Lesson ready!");
                fetchMyLessons();
              }
              break;
            case "failed":
              clearInterval(pollInterval.current);
              pollInterval.current = null;
              setStatus("error");
              setError(res.data.lesson?.errorMessage || "Generation failed");
              break;
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval.current);
          pollInterval.current = null;
          setStatus("error");
          setError("Generation timed out. Please try again.");
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 2000);
  };

  // Video controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  // Select from history
  const selectLesson = (selectedLesson) => {
    setLesson(selectedLesson);
    setTopic(selectedLesson.topic);
    setStatus("completed");
    setShowHistory(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gray-900 rounded-xl shadow-lg">
            <GraduationCap className="h-6 w-6 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Virtual AI Teacher
            </h1>
            <p className="text-sm text-gray-500">
              Learn anything with AI-powered video lessons
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
        >
          <BookOpen className="h-4 w-4" />
          My Lessons ({myLessons.length})
        </button>
      </div>

      <div>
        {/* Topic Input Section */}
        {status !== "completed" && (
          <div className="max-w-2xl mx-auto mb-12">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-black mb-4 text-gray-900 tracking-tight">
                What would you like <span className="text-gray-400 font-bold">to learn?</span>
              </h2>
              <p className="text-gray-500">
                Enter any topic and our AI will create a personalized video
                lesson for you
              </p>
            </div>

            {/* Search Input */}
            <div className="relative mb-6">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                placeholder="e.g., Photosynthesis, Machine Learning, The French Revolution..."
                className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black transition-all shadow-sm"
                disabled={status === "generating"}
              />
              <button
                onClick={handleGenerate}
                disabled={status === "generating" || !topic.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer"
              >
                {status === "generating" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Lesson
                  </>
                )}
              </button>
            </div>

            {/* Suggested Topics */}
            <div className="flex flex-wrap gap-2 justify-center">
              <span className="text-sm text-gray-500">Try:</span>
              {SUGGESTED_TOPICS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-full transition-colors text-gray-700"
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Generation Status */}
            {status === "generating" && (
              <div className="mt-8 p-10 bg-gray-50 border border-gray-100 rounded-3xl">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-8">
                    <div className="w-20 h-20 rounded-full bg-gray-900 animate-pulse flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="absolute inset-x-0 -bottom-2 flex justify-center">
                      <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-gray-900">
                    Creating Your Lesson
                  </h3>
                  <p className="text-gray-500 mb-4">{statusMessage}</p>
                  <div className="w-full max-w-xs bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gray-900 h-full rounded-full animate-pulse w-2/3" />
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    This usually takes 2-3 minutes
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed Lesson View */}
        {status === "completed" && lesson && (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Video Player */}
            <div className="lg:col-span-2">
              <div className="bg-black rounded-2xl overflow-hidden shadow-2xl">
                <div className="aspect-video relative group">
                  {lesson.videoUrl ? (
                    <>
                      <video
                        ref={videoRef}
                        src={lesson.videoUrl}
                        className="w-full h-full object-cover"
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                      />
                      {/* Video Controls Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center gap-4">
                          <button
                            onClick={togglePlay}
                            className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                          >
                            {isPlaying ? (
                              <Pause className="h-6 w-6" />
                            ) : (
                              <Play className="h-6 w-6" />
                            )}
                          </button>
                          <button
                            onClick={toggleMute}
                            className="p-2 hover:bg-white/20 rounded-full transition-colors"
                          >
                            {isMuted ? (
                              <VolumeX className="h-5 w-5" />
                            ) : (
                              <Volume2 className="h-5 w-5" />
                            )}
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={handleFullscreen}
                            className="p-2 hover:bg-white/20 rounded-full transition-colors"
                          >
                            <Maximize className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <div className="text-center">
                        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-gray-500" />
                        <p className="text-gray-400">Video loading...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lesson Info */}
              <div className="mt-6">
                <h2 className="text-3xl font-black mb-2 text-gray-900 tracking-tight">
                  {lesson.topic}
                </h2>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {Math.ceil(lesson.duration / 60)} min
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-gray-900" strokeWidth={1.5} />
                    AI Generated
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => {
                      setStatus("idle");
                      setLesson(null);
                      setTopic("");
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
                  >
                    <RefreshCw className="h-4 w-4" />
                    New Lesson
                  </button>
                  {lesson.videoUrl && (
                    <a
                      href={lesson.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  )}
                  <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-700">
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </div>
              </div>
            </div>

            {/* Key Points Sidebar */}
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
                  <Lightbulb className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
                  Key Takeaways
                </h3>
                <ul className="space-y-3">
                  {lesson.keyPoints && lesson.keyPoints.length > 0 ? (
                    lesson.keyPoints.map((point, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-[10px] font-black uppercase">
                          {index + 1}
                        </span>
                        <span className="text-gray-500">{point}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-400">No key points available</li>
                  )}
                </ul>
              </div>

              {/* Script Preview */}
              {lesson.script && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-900">
                    <BookOpen className="h-5 w-5 text-gray-900" strokeWidth={1.5} />
                    Full Script
                  </h3>
                  <div className="max-h-64 overflow-y-auto text-sm text-gray-500 leading-relaxed">
                    {lesson.script}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Sidebar */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-end">
            <div className="w-full max-w-md bg-white border-l border-gray-200 h-full overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">My Lessons</h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
                >
                  ✕
                </button>
              </div>

              {myLessons.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No lessons yet</p>
                  <p className="text-sm">Generate your first lesson!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myLessons.map((l) => (
                    <button
                      key={l._id}
                      onClick={() => selectLesson(l)}
                      className="w-full text-left p-4 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
                    >
                      <h4 className="font-semibold mb-1 text-gray-900">
                        {l.topic}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${l.status === "completed"
                            ? "bg-gray-900 text-white"
                            : l.status === "failed"
                              ? "bg-gray-100 text-gray-400"
                              : "bg-gray-50 text-gray-500 border border-gray-100"
                            }`}
                        >
                          {l.status}
                        </span>
                        <span>
                          {new Date(l.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
