import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
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
  const [logs, setLogs] = useState([]);

  // User state
  const [currentUser, setCurrentUser] = useState(null);

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [showChat, setShowChat] = useState(true);

  const addLog = (msg) => {
    console.log(msg);
    setLogs((prev) => [...prev.slice(-2), msg]);
    setCallStatus(msg);
  };

  useEffect(() => {
    // Initialize Socket
    socketRef.current = io(API_URL);
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    setCurrentUser(user);

    if (!user.id) {
      navigate("/login");
      return;
    }

    const initCall = async () => {
      try {
        addLog("Getting user media...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        addLog("Media obtained.");

        setupSocketListeners(user.id);

        socketRef.current.emit("join-room", roomId, user.id);
        addLog(`Joined room: ${roomId}`);
      } catch (err) {
        addLog(`Error accessing media: ${err.message}`);
      }
    };

    const setupSocketListeners = (userId) => {
      const socket = socketRef.current;

      // WebRTC Signaling
      socket.on("user-connected", async (newUserId) => {
        addLog(`User connected. Creating Offer...`);
        createPeerConnection(userId);
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit("offer", { roomId, caller: userId, sdp: offer });
      });

      socket.on("offer", async (payload) => {
        addLog("Received Offer.");
        createPeerConnection(userId);
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, caller: userId, sdp: answer });
      });

      socket.on("answer", async (payload) => {
        addLog("Received Answer.");
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        setConnected(true);
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
        addLog("User disconnected");
        setConnected(false);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        closePeerConnection();
      });

      // Chat Listeners
      socket.on("receive-message", (payload) => {
        setMessages((prev) => [...prev, { ...payload, isMe: false }]);
        scrollToBottom();
      });
    };

    const createPeerConnection = (userId) => {
      if (peerConnectionRef.current) return;

      const pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pc.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setConnected(true);
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
      closePeerConnection();
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [roomId, navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const messageData = {
      roomId,
      message: inputMessage,
      senderId: currentUser.id,
      senderName: currentUser.email?.split("@")[0] || "User",
      timestamp: new Date().toISOString(),
    };

    socketRef.current.emit("send-message", messageData);
    setMessages((prev) => [...prev, { ...messageData, isMe: true }]);
    setInputMessage("");
    scrollToBottom();
  };

  const endCall = async () => {
    // If teacher, complete the session to get paid
    // If student, just leave (or can also trigger complete if they want)
    if (currentUser?.role === "teacher") {
      try {
        const confirmEnd = window.confirm("End session and claim payment?");
        if (!confirmEnd) return;

        addLog("Completing session...");
        await axios.post(`${API_URL}/api/meetings/complete`, { roomId });
        alert("Session completed! Payment transferred to your wallet.");
      } catch (err) {
        console.error("Error completing session:", err);
        alert(
          "Error ending session: " +
            (err.response?.data?.message || err.message),
        );
      }
    }
    navigate(-1);
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans">
      {/* Video Area */}
      <div
        className={`flex-1 flex flex-col p-4 relative transition-all ${showChat ? "w-2/3" : "w-full"}`}
      >
        <div className="absolute top-4 left-4 z-10 bg-black/50 px-3 py-1 rounded">
          {callStatus}
        </div>

        <div className="flex-1 flex gap-4 justify-center items-center">
          {/* Remote Video */}
          <div className="relative flex-1 bg-black rounded-xl overflow-hidden h-full max-h-[80vh] flex items-center justify-center border-2 border-gray-800">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            <div className="absolute bottom-4 left-4 bg-black/60 px-2 py-1 rounded text-sm">
              {connected ? "Remote User" : "Waiting for user..."}
            </div>
          </div>

          {/* Local Video (PiP style) */}
          <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-white shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-1 left-2 text-xs bg-black/50 px-1 rounded">
              You
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="h-20 flex items-center justify-center gap-6">
          <button
            onClick={() => setShowChat(!showChat)}
            className="bg-gray-700 p-4 rounded-full hover:bg-gray-600 transition"
          >
            💬 {showChat ? "Hide Chat" : "Show Chat"}
          </button>
          <button
            onClick={endCall}
            className="bg-red-600 px-8 py-3 rounded-full hover:bg-red-700 font-bold transition"
          >
            End Call {currentUser?.role === "teacher" ? " & Claim Payment" : ""}
          </button>
        </div>
      </div>

      {/* Chat Area */}
      {showChat && (
        <div className="w-96 bg-gray-800 flex flex-col border-l border-gray-700">
          <div className="p-4 border-b border-gray-700 font-bold text-lg bg-gray-900/50">
            Live Chat
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-gray-500 text-center mt-10 text-sm">
                No messages yet
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.isMe ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                    msg.isMe
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-gray-700 text-gray-200 rounded-bl-none"
                  }`}
                >
                  {msg.message}
                </div>
                <span className="text-[10px] text-gray-500 mt-1 px-1">
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
            className="p-4 bg-gray-900 border-t border-gray-700"
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="bg-blue-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
