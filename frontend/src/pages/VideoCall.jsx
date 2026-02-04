import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

const API_URL = "https://hobby-affiliated-adds-theology.trycloudflare.com";
const socket = io(API_URL);

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoCall() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [callStatus, setCallStatus] = useState("Connecting...");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (!user.id) {
      navigate("/login");
      return;
    }

    const initCall = async () => {
      // Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      // Create peer connection
      peerConnectionRef.current = new RTCPeerConnection(config);

      // Add local tracks
      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      // Handle remote track
      peerConnectionRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnected(true);
        setCallStatus("Connected");
      };

      // Handle ICE candidates
      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { roomId, candidate: event.candidate });
        }
      };

      // Join room
      socket.emit("join-room", roomId, user.id);

      // Handle user connected (create offer)
      socket.on("user-connected", async () => {
        setCallStatus("User joined, creating offer...");
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit("offer", { roomId, caller: user.id, sdp: offer });
      });

      // Handle offer
      socket.on("offer", async (payload) => {
        setCallStatus("Received offer, creating answer...");
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, caller: user.id, sdp: answer });
      });

      // Handle answer
      socket.on("answer", async (payload) => {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        setCallStatus("Call connected");
      });

      // Handle ICE candidate
      socket.on("ice-candidate", async (payload) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(payload.candidate),
          );
        }
      });

      // Handle user disconnected
      socket.on("user-disconnected", () => {
        setCallStatus("User disconnected");
        setConnected(false);
      });
    };

    initCall();

    return () => {
      // Cleanup
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socket.off("user-connected");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("user-disconnected");
    };
  }, [roomId, navigate]);

  const endCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
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
      <p>Status: {callStatus}</p>

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
            style={{ width: "100%", background: "#000", borderRadius: "12px" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <h3>Remote</h3>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "100%", background: "#000", borderRadius: "12px" }}
          />
        </div>
      </div>

      <button
        onClick={endCall}
        style={{
          marginTop: "30px",
          padding: "15px 40px",
          fontSize: "18px",
          background: "#e53935",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
        }}
      >
        End Call
      </button>
    </div>
  );
}
