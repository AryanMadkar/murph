import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      setMessage("Error accessing camera: " + err.message);
    }
  };

  const captureAndLogin = async () => {
    if (!email) {
      setMessage("Please enter your email");
      return;
    }

    setLoading(true);
    setMessage("");

    // Stop camera before processing
    const stream = videoRef.current.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setCameraActive(false);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("image", blob, "face.jpg");

      try {
        const response = await axios.post(`${API_URL}/login`, formData);
        if (response.data.success) {
          setMessage("✅ Login successful!");
          localStorage.setItem("user", JSON.stringify(response.data.user));
          const role = response.data.user.role;
          setTimeout(() => {
            navigate(role === "teacher" ? "/teacher" : "/student");
          }, 1000);
        }
      } catch (err) {
        setMessage("❌ " + (err.response?.data?.message || err.message));
      } finally {
        setLoading(false);
      }
    }, "image/jpeg");
  };

  return (
    <div
      style={{
        padding: "40px",
        maxWidth: "500px",
        margin: "0 auto",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Login</h1>

      <div style={{ marginBottom: "20px" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: "10px", fontSize: "16px" }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            background: "#000",
            borderRadius: "8px",
            transform: "scaleX(-1)",
          }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {loading ? (
        <button
          disabled
          style={{
            padding: "15px 30px",
            fontSize: "16px",
            cursor: "not-allowed",
            background: "#ccc",
            color: "#666",
            border: "none",
          }}
        >
          ⏳ Verifying...
        </button>
      ) : !cameraActive ? (
        <button
          onClick={startCamera}
          style={{ padding: "15px 30px", fontSize: "16px", cursor: "pointer" }}
        >
          📷 Start Camera
        </button>
      ) : (
        <button
          onClick={captureAndLogin}
          style={{
            padding: "15px 30px",
            fontSize: "16px",
            cursor: "pointer",
            background: "#2196F3",
            color: "#fff",
            border: "none",
          }}
        >
          🔐 Login with Face
        </button>
      )}

      {message && (
        <p style={{ marginTop: "20px", fontWeight: "bold" }}>{message}</p>
      )}

      <p style={{ marginTop: "30px" }}>
        New user? <a href="/register">Register here</a>
      </p>
    </div>
  );
}
