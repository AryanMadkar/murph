import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { Loader2, CheckCircle, Clock, BookOpen } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const socket = io(API_URL);

export default function TeacherDashboard() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("requests");
  const [materials, setMaterials] = useState([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const navigate = useNavigate();

  // Material upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [materialForm, setMaterialForm] = useState({
    title: "",
    description: "",
    type: "video",
    price: "",
    category: "",
    tags: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);

  // Wallet state
  const [walletBalance, setWalletBalance] = useState(0);

  // Get auth headers
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

  const fetchDashboardData = async (teacherId) => {
    setLoading(true);
    setMaterialsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };

      const [requestsRes, materialsRes] = await Promise.all([
        axios.get(`${API_URL}/api/meetings/pending/${teacherId}`, { headers }),
        axios.get(`${API_URL}/api/materials/teacher`, { headers }),
      ]);

      if (requestsRes.data.success) {
        setRequests(requestsRes.data.meetings || []);
      }
      if (materialsRes.data.success) {
        setMaterials(materialsRes.data.materials || []);
      }
    } catch (err) {
      console.error("Error fetching dashboard data:", err);
      setMessage("Error loading dashboard data: " + err.message);
    } finally {
      setLoading(false);
      setMaterialsLoading(false);
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

    // Fetch initial data
    fetchBalance();
    socket.emit("register-user", parsedUser.id);
    fetchDashboardData(parsedUser.id);

    socket.on("new-meeting-request", ({ studentEmail }) => {
      setMessage(`🔔 New meeting request from ${studentEmail}`);
      fetchRequests(parsedUser.id);
    });

    return () => {
      socket.off("new-meeting-request");
    };
  }, [navigate]);

  const fetchRequests = (teacherId) => {
    axios
      .get(`${API_URL}/api/meetings/pending/${teacherId}`)
      .then((res) => {
        setRequests(res.data.meetings);
        setLoading(false);
      })
      .catch((err) => {
        setMessage("Error loading requests: " + err.message);
        setLoading(false);
      });
  };

  const acceptMeeting = async (meetingId, studentId) => {
    try {
      const res = await axios.post(
        `${API_URL}/api/meetings/accept/${meetingId}`,
      );

      if (res.data.success) {
        // Start Attention Session silently
        try {
          await axios.post(`${API_URL}/api/attention/start`, {
            meetingId,
            studentId,
            teacherId: user.id,
            roomId: res.data.roomId,
          });
        } catch (err) {
          console.error("Failed to start attention session:", err);
        }

        setMessage("✅ Meeting accepted! Starting call...");

        socket.emit("meeting-accepted", {
          studentId,
          roomId: res.data.roomId,
        });

        setTimeout(() => navigate(`/video-call/${res.data.roomId}`), 1000);
      }
    } catch (err) {
      setMessage("❌ " + (err.response?.data?.message || err.message));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setMessage("Please select a file to upload");
      return;
    }

    setUploadLoading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", materialForm.title);
    formData.append("description", materialForm.description);
    formData.append("type", materialForm.type);
    formData.append("price", materialForm.price * 100); // to paise
    formData.append("category", materialForm.category);
    formData.append("tags", materialForm.tags);

    try {
      const res = await axios.post(
        `${API_URL}/api/materials/upload`,
        formData,
        {
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (res.data.success) {
        setMessage("✅ Content uploaded successfully!");
        setShowUploadModal(false);
        setMaterialForm({
          title: "",
          description: "",
          type: "video",
          price: "",
          category: "",
          tags: "",
        });
        setSelectedFile(null);
        fetchDashboardData(user.id); // Refresh materials list
      }
    } catch (err) {
      setMessage(
        "❌ Upload failed: " + (err.response?.data?.message || err.message),
      );
    } finally {
      setUploadLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-['Source_Sans_Pro'] pt-28 pb-12 px-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Teacher Dashboard
            </h1>
            {user && (
              <p className="text-gray-500 mt-2 text-lg">
                Welcome back, {user.email}
              </p>
            )}
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-xl transition-all cursor-pointer flex items-center gap-2"
            >
              <span>+</span> Upload Content
            </button>

            {/* Wallet Balance Card */}
            <div
              onClick={() => navigate("/wallet")}
              className="bg-black text-white px-6 py-4 rounded-2xl shadow-xl cursor-pointer hover:bg-gray-800 transition-all flex flex-col items-center min-w-[140px]"
            >
              <p className="text-[10px] uppercase tracking-widest opacity-60 font-bold mb-1">
                My Earnings
              </p>
              <p className="text-2xl font-black">${walletBalance.toFixed(2)}</p>
            </div>

            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-900 font-medium transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Notifications */}
        {message && (
          <div className="mb-8 p-4 bg-white border border-gray-100 shadow-sm rounded-xl flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <p className="font-medium text-gray-800">{message}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab("requests")}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${
              activeTab === "requests"
                ? "bg-black text-white"
                : "bg-white text-gray-400 hover:text-gray-900"
            }`}
          >
            Pending Requests ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab("materials")}
            className={`px-6 py-2 rounded-xl font-bold text-sm transition-all cursor-pointer ${
              activeTab === "materials"
                ? "bg-black text-white"
                : "bg-white text-gray-400 hover:text-gray-900"
            }`}
          >
            My Published Content ({materials.length})
          </button>
        </div>

        {/* Content Section */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden p-8 min-h-[400px]">
          {activeTab === "requests" ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                Pending Requests
              </h2>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p>Loading requests...</p>
                </div>
              ) : requests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                  <CheckCircle className="h-10 w-10 mb-3 opacity-20" />
                  <p className="font-medium">No pending requests</p>
                  <p className="text-sm opacity-60">You're all caught up!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((req) => (
                    <div
                      key={req._id}
                      className="p-6 bg-gray-50 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 transition-all hover:bg-gray-100"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-xl shadow-sm">
                          🎓
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 font-medium mb-0.5">
                            Student
                          </p>
                          <p className="text-lg font-bold text-gray-900">
                            {req.studentId?.email || "Unknown"}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          acceptMeeting(req._id, req.studentId?._id)
                        }
                        className="w-full sm:w-auto px-8 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-full transition-all shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2"
                      >
                        Accept Session
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-purple-500" />
                Published Materials
              </h2>

              {materialsLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p>Loading your content...</p>
                </div>
              ) : materials.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                  <BookOpen className="h-10 w-10 mb-3 opacity-20" />
                  <p className="font-medium">No content published yet</p>
                  <p className="text-sm opacity-60">
                    Upload your first video or document to start earning!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {materials.map((m) => (
                    <div
                      key={m._id}
                      className="p-6 bg-gray-50 rounded-2xl border border-transparent hover:border-purple-100 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 bg-purple-50 px-2 py-1 rounded">
                          {m.type}
                        </span>
                        <span className="font-bold text-gray-900">
                          ${m.priceInDollars.toFixed(2)}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 mb-1">
                        {m.title}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-4">
                        {m.description}
                      </p>

                      <div className="mt-auto border-t border-gray-100 pt-4 flex justify-between items-center">
                        <div className="flex gap-4">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400">
                              Sales
                            </p>
                            <p className="font-bold text-gray-900">
                              {m.purchaseCount || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400">
                              Category
                            </p>
                            <p className="font-bold text-gray-900 text-xs">
                              {m.category}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem("token");
                              const res = await axios.get(
                                `${API_URL}/api/materials/access/${m._id}`,
                                {
                                  headers: { Authorization: `Bearer ${token}` },
                                },
                              );
                              if (res.data.success) {
                                window.open(res.data.url, "_blank");
                              }
                            } catch (err) {
                              setMessage(
                                "❌ Failed to access: " +
                                  (err.response?.data?.message || err.message),
                              );
                            }
                          }}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 hover:text-purple-600 hover:border-purple-200 text-xs font-bold rounded-lg transition-all"
                        >
                          View File
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">
                Upload Content
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpload} className="p-8 space-y-5">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={materialForm.title}
                    onChange={(e) =>
                      setMaterialForm({
                        ...materialForm,
                        title: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-purple-500 focus:outline-none transition-all"
                    placeholder="Python for Beginners"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Type
                    </label>
                    <select
                      value={materialForm.type}
                      onChange={(e) =>
                        setMaterialForm({
                          ...materialForm,
                          type: e.target.value,
                        })
                      }
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-purple-500 focus:outline-none transition-all appearance-none"
                    >
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Price (USD)
                    </label>
                    <input
                      type="number"
                      required
                      value={materialForm.price}
                      onChange={(e) =>
                        setMaterialForm({
                          ...materialForm,
                          price: e.target.value,
                        })
                      }
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-purple-500 focus:outline-none transition-all"
                      placeholder="9.99"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Category
                    </label>
                    <select
                      required
                      value={materialForm.category}
                      onChange={(e) =>
                        setMaterialForm({
                          ...materialForm,
                          category: e.target.value,
                        })
                      }
                      className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-purple-500 focus:outline-none transition-all appearance-none"
                    >
                      <option value="">Select</option>
                      <option value="Programming">Programming</option>
                      <option value="Math">Math</option>
                      <option value="Science">Science</option>
                      <option value="Design">Design</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                      File
                    </label>
                    <input
                      type="file"
                      required
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                      className="w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:bg-gray-100 file:text-gray-600 hover:file:bg-gray-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest font-bold text-gray-400 mb-2">
                    Description
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={materialForm.description}
                    onChange={(e) =>
                      setMaterialForm({
                        ...materialForm,
                        description: e.target.value,
                      })
                    }
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border border-transparent focus:bg-white focus:border-purple-500 focus:outline-none transition-all resize-none"
                    placeholder="Detailed description..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={uploadLoading}
                className="w-full py-5 bg-black hover:bg-gray-800 text-white font-bold rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 disabled:bg-gray-300 cursor-pointer"
              >
                {uploadLoading ? (
                  <Loader2 className="animate-spin h-5 w-5" />
                ) : (
                  "Upload & Publish"
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
