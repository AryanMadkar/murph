import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function Register() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [secretKey, setSecretKey] = useState("");
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

  const captureAndRegister = async () => {
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
      formData.append("role", role);
      formData.append("secretKey", secretKey);
      formData.append("image", blob, "face.jpg");

      try {
        const response = await axios.post(`${API_URL}/register`, formData);
        if (response.data.success) {
          setMessage("✅ Registration successful! Redirecting...");
          localStorage.setItem("user", JSON.stringify(response.data.user));
          setTimeout(() => {
            navigate(role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
          }, 1500);
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
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Register</h1>

      <div className="mb-5">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 text-base border border-gray-300 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            fontSize: "16px",
            marginBottom: "10px",
          }}
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>

        <input
          type="password"
          placeholder="Registration Secret Key"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            fontSize: "16px",
          }}
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
          ⏳ Processing...
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
          onClick={captureAndRegister}
          className="px-8 py-4 text-base cursor-pointer bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
        >
          ✅ Register with Face
        </button>
      )}

      {message && (
        <p className="mt-5 font-bold text-gray-800">{message}</p>
      )}

      <p className="mt-8 text-gray-600">
        Already registered? <a href="/login" className="text-blue-500 hover:underline">Login here</a>
      </p>
    </div>
  );
}
