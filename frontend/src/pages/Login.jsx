import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = "https://hobby-affiliated-adds-theology.trycloudflare.com/api";

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
            navigate(role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
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
    <div className="p-10 max-w-md mx-auto font-sans">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Login</h1>

      <div className="mb-5">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-5">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full bg-black rounded-lg scale-x-[-1]"
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {loading ? (
        <button
          disabled
          className="px-8 py-4 text-base cursor-not-allowed bg-gray-300 text-gray-500 rounded-lg"
        >
          ⏳ Verifying...
        </button>
      ) : !cameraActive ? (
        <button
          onClick={startCamera}
          className="px-8 py-4 text-base cursor-pointer bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
        >
          📷 Start Camera
        </button>
      ) : (
        <button
          onClick={captureAndLogin}
          className="px-8 py-4 text-base cursor-pointer bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
        >
          🔐 Login with Face
        </button>
      )}

      {message && (
        <p className="mt-5 font-bold text-gray-800">{message}</p>
      )}

      <p className="mt-8 text-gray-600">
        New user? <a href="/register" className="text-blue-500 hover:underline">Register here</a>
      </p>
    </div>
  );
}
