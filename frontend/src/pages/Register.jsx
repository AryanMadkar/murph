import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Camera, CheckCircle, AlertCircle } from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function Register() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err) {
      setMessage("Error accessing camera: " + err.message);
    }
  };

  const captureAndRegister = async () => {
    if (!email) {
      setMessage("Please enter your email");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setMessage("");

    const video = videoRef.current;

    // Ensure video is playing and ready
    if (!video || !video.srcObject) {
      setMessage("Camera not active");
      setLoading(false);
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    // Stop camera stream immediately after capture
    const stream = video.srcObject;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setCameraActive(false);

    canvas.toBlob(async (blob) => {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("role", role);
      formData.append("image", blob, "face.jpg");

      try {
        const response = await axios.post(`${API_URL}/register`, formData);
        if (response.data.success) {
          setMessage("success"); // Flag for UI
          localStorage.setItem("user", JSON.stringify(response.data.user));
          setTimeout(() => {
            navigate(
              role === "teacher" ? "/teacher-dashboard" : "/student-dashboard",
            );
          }, 1500);
        }
      } catch (err) {
        setMessage(err.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    }, "image/jpeg");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Source_Sans_Pro']">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <a
          href="/"
          className="flex items-center justify-center gap-2.5 no-underline mb-6"
        >
          <span className="w-8 h-8 bg-orange-500 rounded-full"></span>
          <span className="text-2xl font-bold text-gray-900 tracking-tight">
            Humble
          </span>
        </a>
        <h2 className="mt-2 text-center text-3xl font-bold tracking-tight text-gray-900">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link
            to="/login"
            className="font-medium text-orange-600 hover:text-orange-500"
          >
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-gray-100 sm:rounded-2xl sm:px-10 border border-gray-100">
          <div className="space-y-6">
            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I am a...
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`flex justify-center py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                    role === "student"
                      ? "bg-gray-900 text-white shadow-md"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setRole("teacher")}
                  className={`flex justify-center py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                    role === "teacher"
                      ? "bg-gray-900 text-white shadow-md"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Teacher
                </button>
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2.5 placeholder-gray-400 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Secret Key Input REMOVED */}

            {/* Camera Section */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Face Verification
              </label>
              <div className="relative rounded-xl overflow-hidden bg-gray-100 border border-gray-200 aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] ${!cameraActive && "hidden"}`}
                />

                {!cameraActive && (
                  <div className="text-center p-6">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 mb-3">
                      <Camera
                        className="h-6 w-6 text-orange-600"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-sm text-gray-500">
                      Camera permission required for face ID
                    </p>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="mt-2 w-full flex justify-center items-center py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Enable Camera
                </button>
              ) : null}
            </div>

            {/* Error/Success Messages */}
            {message && message !== "success" && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle
                      className="h-5 w-5 text-red-400"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Registration Failed
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{message}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {message === "success" && (
              <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <CheckCircle
                      className="h-5 w-5 text-green-400"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      Registration Successful
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>Redirecting you to dashboard...</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="button"
                onClick={captureAndRegister}
                disabled={loading || !cameraActive}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 ${
                  loading || !cameraActive
                    ? "bg-gray-400 cursor-not-allowed hover:transform-none"
                    : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Processing...
                  </>
                ) : (
                  "Complete Registration"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
