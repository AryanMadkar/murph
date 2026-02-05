import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import axios from "axios";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Send,
  X,
  User,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;
const AI_SESSION_URL = "http://localhost:8000";

const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceTransportPolicy: "all",
  bundlePolicy: "balanced",
};

export default function VideoCall() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const messagesEndRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [callStatus, setCallStatus] = useState("Initializing...");
  const [currentUser, setCurrentUser] = useState(null);

  // Controls State
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [liveAttention, setLiveAttention] = useState({
    score: 0.85, // Default/Starting score
    faceDetected: true,
  });
  const recordingRef = useRef(null);
  const audioChunksRef = useRef([]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  };

  const startRecording = () => {
    try {
      const stream = localStreamRef.current;
      if (!stream) return;

      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = uploadRecording;
      mediaRecorder.start();
      recordingRef.current = mediaRecorder;
      console.log("🎙️ Session recording started");
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  };

  const stopRecording = () => {
    if (recordingRef.current && recordingRef.current.state !== "inactive") {
      recordingRef.current.stop();
      console.log("🎙️ Session recording stopped");
    }
  };

  const uploadRecording = async () => {
    if (
      audioChunksRef.current.length === 0 ||
      !currentUser ||
      currentUser.role !== "student"
    )
      return;

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob);
    formData.append("roomId", roomId);

    try {
      await axios.post(`${API_URL}/api/meetings/upload-audio`, formData, {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "multipart/form-data",
        },
      });
      console.log("✅ Session audio uploaded for AI notes");
    } catch (err) {
      console.error("❌ Failed to upload session audio:", err);
    }
  };

  useEffect(() => {
    if (connected) {
      startRecording();
    }
    return () => stopRecording();
  }, [connected]);

  useEffect(() => {
    socketRef.current = io(API_URL);

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    setCurrentUser(user);

    if (!user._id) {
      navigate("/login");
      return;
    }

    const initCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { max: 24 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        setupSocketListeners(user._id);

        socketRef.current.emit("join-room", roomId, user._id);
        setCallStatus("Waiting for other user...");
      } catch (err) {
        console.error("Error accessing media:", err);
        setCallStatus("Error accessing camera/mic");
      }
    };

    const setupSocketListeners = (userId) => {
      const socket = socketRef.current;

      socket.on("user-connected", async (newUserId) => {
        setCallStatus("Connecting...");
        createPeerConnection(userId);
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit("offer", { roomId, caller: userId, sdp: offer });
      });

      socket.on("offer", async (payload) => {
        createPeerConnection(userId);
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, caller: userId, sdp: answer });
      });

      socket.on("answer", async (payload) => {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        setConnected(true);
        setCallStatus("Connected");
      });

      socket.on("ice-candidate", async (payload) => {
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(payload.candidate),
            );
          } catch (e) {
            console.error("Error adding ICE candidate", e);
          }
        }
      });

      socket.on("user-disconnected", () => {
        setCallStatus("User disconnected");
        setConnected(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        closePeerConnection();
      });

      socket.on("receive-message", (payload) => {
        setMessages((prev) => [...prev, { ...payload, isMe: false }]);
        scrollToBottom();
      });

      // Handle mutual termination
      socket.on("session-ended", (payload) => {
        console.log("The other participant has ended the session.");
        // Redirect teacher to review if they didn't initiate the end
        if (currentUser?.role === "teacher" && payload.attentionSessionId) {
          navigate(`/session-review/${payload.attentionSessionId}`);
        } else {
          navigate(-1);
        }
      });

      socket.on("attention-update", (data) => {
        setLiveAttention({
          score: data.attentionScore,
          faceDetected: data.faceDetected,
        });
      });
    };

    const createPeerConnection = (userId) => {
      if (peerConnectionRef.current) return;
      const pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, localStreamRef.current);

          // Apply bitrate limits to video track
          if (track.kind === "video") {
            const params = sender.getParameters();
            if (!params.encodings) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 800 * 1000; // 800 kbps
            sender
              .setParameters(params)
              .catch((e) => console.error("Bitrate set error", e));
          }
        });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current)
          remoteVideoRef.current.srcObject = event.streams[0];
        setConnected(true);
        setCallStatus("Connected");
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };
    };

    const closePeerConnection = () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };

    initCall();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      stopRecording();
      closePeerConnection();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [roomId, navigate]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoOn(videoTrack.enabled);
      }
    }
  };

  // ================= SESSION START & ATTENTION TRACKING =================
  useEffect(() => {
    if (!connected || !currentUser) return;

    let sessionId = null;
    let aiSessionId = null;

    const startSessionFlow = async () => {
      try {
        // 1. Start/Mark Meeting as Active & Init Attention Session
        const token = localStorage.getItem("token");
        const res = await axios.post(
          `${API_URL}/api/meetings/start/${roomId}`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (res.data.success) {
          sessionId = res.data.attentionSessionId;
          console.log("Backend Session Started:", sessionId);
        }

        // 2. Start AI Model Session (only if student)
        if (currentUser.role === "student") {
          const aiRes = await axios.post(`${AI_SESSION_URL}/session/start`);
          aiSessionId = aiRes.data.session_id;
          console.log("AI Attention Tracking started:", aiSessionId);
        }
      } catch (err) {
        console.error("Failed to start session flow:", err);
      }
    };

    startSessionFlow();

    const interval = setInterval(async () => {
      if (!sessionId || !aiSessionId || !localVideoRef.current) return;

      try {
        const video = localVideoRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL("image/jpeg", 0.6);

        const blob = await (await fetch(frameData)).blob();
        const formData = new FormData();
        formData.append("file", blob, "frame.jpg");

        const aiRes = await axios.post(
          `${AI_SESSION_URL}/session/frame/${aiSessionId}`,
          formData,
        );

        if (aiRes.data.face_detected) {
          await axios.post(`${API_URL}/api/attention/record`, {
            sessionId,
            score: aiRes.data.attention_score,
            stabilityScore: aiRes.data.stability_score,
            centeringScore: aiRes.data.centering_score,
            faceDetected: true,
          });

          socketRef.current.emit("attention-update", {
            roomId,
            attentionScore: aiRes.data.attention_score,
            stabilityScore: aiRes.data.stability_score,
            centeringScore: aiRes.data.centering_score,
            faceDetected: true,
          });
        }
      } catch (err) {
        console.warn("Silent tracking error:", err.message);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [connected, currentUser, roomId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const messageData = {
      roomId,
      message: inputMessage,
      senderId: currentUser._id,
      senderName: currentUser.email?.split("@")[0] || "User",
      timestamp: new Date().toISOString(),
    };

    socketRef.current.emit("send-message", messageData);
    setMessages((prev) => [...prev, { ...messageData, isMe: true }]);
    setInputMessage("");
    scrollToBottom();
  };

  const endCall = async () => {
    const confirmEnd = window.confirm(
      "Are you sure you want to end the session?",
    );
    if (!confirmEnd) return;

    try {
      const res = await axios.post(`${API_URL}/api/meetings/complete`, {
        roomId,
      });
      console.log("Session marked as completed");

      // Notify the other user that the session is over
      socketRef.current.emit("session-ended", {
        roomId,
        attentionSessionId: res.data.attentionSessionId,
      });

      if (currentUser?.role === "teacher" && res.data.attentionSessionId) {
        navigate(`/session-review/${res.data.attentionSessionId}`);
        return;
      }
    } catch (err) {
      console.error("Error marking session completed:", err);
    }
    navigate(-1);
  };

  return (
    <div className="flex h-screen bg-black text-white font-['Source_Sans_Pro'] overflow-hidden relative">
      {/* Video Grid */}
      <div
        className={`flex-1 relative transition-all duration-300 ${showChat ? "mr-96" : ""}`}
      >
        {/* Remote Video (Main) */}
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="relative w-full h-full max-h-[90vh] bg-[#1a1a1a] rounded-3xl overflow-hidden shadow-2xl border border-gray-800">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {!connected && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-4">
                <div className="h-20 w-20 rounded-full bg-gray-800 flex items-center justify-center animate-pulse">
                  <User className="h-10 w-10 opacity-50" />
                </div>
                <p className="font-medium text-lg">{callStatus}</p>
              </div>
            )}

            {/* Teacher's Live Attention Widget */}
            {currentUser?.role === "teacher" && connected && (
              <div className="absolute top-6 right-6 bg-black/40 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shadow-2xl z-20 flex items-center gap-4 transition-all animate-in fade-in slide-in-from-right-4">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`h-2 w-2 rounded-full ${liveAttention.faceDetected ? "bg-white animate-pulse" : "bg-gray-500"}`}></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
                      Live Engagement
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-white">
                      {Math.round(liveAttention.score * 100)}%
                    </span>
                    <span className="text-[10px] font-bold text-white/50 lowercase">
                      focus
                    </span>
                  </div>
                </div>
                <div className="w-12 h-12 relative flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      className="text-white/10"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="transparent"
                      strokeDasharray={126}
                      strokeDashoffset={126 - (126 * liveAttention.score)}
                      strokeLinecap="round"
                      className={`transition-all duration-1000 ${liveAttention.score > 0.7 ? "text-white" : liveAttention.score > 0.4 ? "text-gray-400" : "text-gray-500"}`}
                    />
                  </svg>
                </div>
              </div>
            )}

            {/* Local Video (Floating PiP) */}
            <div className="absolute bottom-6 right-6 w-64 aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 group transition-transform hover:scale-105">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform scale-x-[-1] ${!videoOn && "hidden"}`}
              />
              {!videoOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <VideoOff className="h-8 w-8 text-red-500" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-xs font-medium backdrop-blur-sm">
                You {micOn ? "" : "(Muted)"}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Control Bar */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-900/90 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10 shadow-2xl z-50">
          <button
            onClick={toggleMic}
            className={`p-4 rounded-full transition-all ${micOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600 text-white"}`}
          >
            {micOn ? (
              <Mic className="h-6 w-6" />
            ) : (
              <MicOff className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${videoOn ? "bg-gray-700 hover:bg-gray-600" : "bg-red-500 hover:bg-red-600 text-white"}`}
          >
            {videoOn ? (
              <Video className="h-6 w-6" />
            ) : (
              <VideoOff className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={endCall}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-full font-bold transition-all mx-2"
          >
            <PhoneOff className="h-6 w-6" />
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            className={`p-4 rounded-full transition-all relative ${showChat ? "bg-white text-black" : "bg-gray-700 hover:bg-gray-600"}`}
          >
            <MessageSquare className="h-6 w-6" strokeWidth={1.5} />
            {messages.length > 0 && !showChat && (
              <span className="absolute top-0 right-0 h-3 w-3 bg-white rounded-full border-2 border-gray-900"></span>
            )}
          </button>
        </div>
      </div>

      {/* Chat Panel (Slide-over) */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-[#0f0f0f] border-l border-gray-800 transform transition-transform duration-300 ease-in-out z-40 flex flex-col ${showChat ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#0f0f0f]">
          <h2 className="font-bold text-lg">Meeting Chat</h2>
          <button
            onClick={() => setShowChat(false)}
            className="text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#0f0f0f]">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2 opacity-50">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">No messages yet</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.isMe
                  ? "bg-white text-black rounded-tr-none font-bold"
                  : "bg-gray-800 text-gray-200 rounded-tl-none font-medium"
                  }`}
              >
                {msg.message}
              </div>
              <span className="text-[10px] text-gray-500 mt-1.5 px-1">
                {msg.isMe ? "You" : msg.senderName} •{" "}
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={sendMessage}
          className="p-4 border-t border-gray-800 bg-[#0f0f0f]"
        >
          <div className="relative">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type into chat..."
              className="w-full bg-gray-800 text-white pl-4 pr-12 py-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-white text-sm placeholder-gray-500 transition-all border border-transparent focus:border-white"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-white hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
