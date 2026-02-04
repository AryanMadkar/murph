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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      peerConnectionRef.current = new RTCPeerConnection(config);

      stream.getTracks().forEach((track) => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      peerConnectionRef.current.ontrack = (event) => {
        remoteVideoRef.current.srcObject = event.streams[0];
        setConnected(true);
        setCallStatus("Connected");
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", { roomId, candidate: event.candidate });
        }
      };

      socket.emit("join-room", roomId, user.id);

      socket.on("user-connected", async () => {
        setCallStatus("User joined, creating offer...");
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socket.emit("offer", { roomId, caller: user.id, sdp: offer });
      });

      socket.on("offer", async (payload) => {
        setCallStatus("Received offer, creating answer...");
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit("answer", { roomId, caller: user.id, sdp: answer });
      });

      socket.on("answer", async (payload) => {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(payload.sdp),
        );
        setCallStatus("Call connected");
      });

      socket.on("ice-candidate", async (payload) => {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(payload.candidate),
          );
        }
      });

      socket.on("user-disconnected", () => {
        setCallStatus("User disconnected");
        setConnected(false);
      });
    };

    initCall();

    return () => {
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
    <div className="p-5 font-sans bg-slate-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-2">Video Call</h1>
      <p className="text-gray-400">Room: {roomId}</p>
      <p className={`mb-6 ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
        Status: {callStatus}
      </p>

      <div className="flex gap-5 mt-5 flex-wrap">
        <div className="flex-1 min-w-[300px]">
          <h3 className="text-lg font-semibold mb-2">You</h3>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full bg-black rounded-xl"
          />
        </div>
        <div className="flex-1 min-w-[300px]">
          <h3 className="text-lg font-semibold mb-2">Remote</h3>
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
