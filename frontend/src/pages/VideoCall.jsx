import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL;
// Don't initialize socket globally to avoid sticky connections/listeners issues in React Strict Mode
// const socket = io(API_URL);

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

  const [connected, setConnected] = useState(false);
  const [callStatus, setCallStatus] = useState("Initializing...");
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    console.log(msg);
    setLogs((prev) => [...prev.slice(-4), msg]); // Keep last 5 logs for UI
    setCallStatus(msg);
  };

  useEffect(() => {
    // Initialize Socket
    socketRef.current = io(API_URL);
    const user = JSON.parse(localStorage.getItem("user") || "{}");

    if (!user.id) {
      navigate("/login");
      return;
    }

    const initCall = async () => {
      try {
        addLog("Getting user media...");
        // Get local media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        addLog("Local media obtained.");

        // Join room logic
        setupSocketListeners(user.id);

        socketRef.current.emit("join-room", roomId, user.id);
        addLog(`Joined room: ${roomId}`);
      } catch (err) {
        addLog(`Error accessing media: ${err.message}`);
      }
    };

    const setupSocketListeners = (userId) => {
      const socket = socketRef.current;

      // Handle user connected (create offer) - WE are the caller
      socket.on("user-connected", async (newUserId) => {
        addLog(`User connected: ${newUserId}. Creating Offer...`);
        createPeerConnection(userId);

        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);

        addLog("Sending Offer...");
        socket.emit("offer", { roomId, caller: userId, sdp: offer });
      });

      // Handle offer - WE are the callee
      socket.on("offer", async (payload) => {
        addLog("Received Offer. Creating Answer...");
        createPeerConnection(userId); // Ensure PC exists

        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );

        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);

        addLog("Sending Answer...");
        socket.emit("answer", { roomId, caller: userId, sdp: answer });
      });

      socket.on("answer", async (payload) => {
        addLog("Received Answer. Setting Remote Description...");
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        setConnected(true);
        addLog("Call Connected!");
      });

      socket.on("ice-candidate", async (payload) => {
        if (peerConnectionRef.current) {
          try {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(payload.candidate),
            );
            // addLog("Added ICE Candidate");
          } catch (e) {
            console.error("Error adding ICE candidate", e);
          }
        }
      });

      socket.on("user-disconnected", () => {
        addLog("User disconnected");
        setConnected(false);
        if (remoteVideoRef.current) srcObject = null;
        closePeerConnection();
      });
    };

    const createPeerConnection = (userId) => {
      if (peerConnectionRef.current) {
        // Optionally close existing? logic usually assumes 1-on-1
        // addLog("PeerConnection already exists, reusing/resetting?");
        // For now, let's keep it simple. If we need to support multi-party, we need a map of PCs.
        // Assuming 1-on-1 for now.
        return;
      }
      addLog("Creating RTCPeerConnection");
      const pc = new RTCPeerConnection(config);
      peerConnectionRef.current = pc;

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Handle remote track
      pc.ontrack = (event) => {
        addLog("Received Remote Track");
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        setConnected(true);
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit("ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        addLog(`PC State: ${pc.connectionState}`);
      };
    };

    const closePeerConnection = () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
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

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId, navigate]);

  const endCall = () => {
    navigate(-1);
  };

  return (
    <div
      style={{
        padding: "20px",
        fontFamily: "sans-serif",
        background: "#1a1a2e",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h1>Video Call</h1>
      <p>Room: {roomId}</p>

      <div
        style={{
          background: "#333",
          padding: "10px",
          borderRadius: "5px",
          marginBottom: "20px",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
      >
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "20px",
          marginTop: "20px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: "300px" }}>
          <h3>You</h3>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full bg-black rounded-xl"
          />
        </div>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <h3>Remote {connected ? "(Connected)" : "(Waiting...)"}</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full bg-black rounded-xl"
          />
        </div>
      </div>

      <button
        onClick={endCall}
        className="mt-8 px-10 py-4 text-lg bg-red-500 hover:bg-red-600 text-white rounded-lg cursor-pointer transition-colors"
      >
        End Call
      </button>
    </div>
  );
}
