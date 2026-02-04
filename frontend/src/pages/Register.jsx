import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, CheckCircle, AlertCircle, Lock } from "lucide-react";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = localStorage.getItem("token");
    if (user && token) {
      navigate(
        user.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard",
      );
    }
  }, [navigate]);

  const handleRegister = async () => {
    if (!email || !password || !name) {
      setMessage("Please fill in all fields");
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

    try {
      const response = await axios.post(`${API_URL}/register`, {
        name,
        email,
        password,
        role,
      });

      if (response.data.status === "success" || response.data.token) {
        setMessage("✅ Registration successful! Redirecting...");
        // ✅ Store both user and JWT token
        localStorage.setItem("user", JSON.stringify(response.data.data.user));
        localStorage.setItem("token", response.data.token);
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
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Source_Sans_Pro']">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <a
          href="/"
          className="flex items-center justify-center gap-2.5 no-underline mb-6"
        >
          <img
            src="/logo.png"
            alt="Murph Logo"
            className="w-8 h-8 object-contain"
          />
          <span className="text-2xl font-bold text-gray-900 tracking-tight">
            Murph
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

            {/* Name Input */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700"
              >
                Full Name
              </label>
              <div className="mt-1">
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2.5 placeholder-gray-400 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm"
                  placeholder="John Doe"
                />
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

            {/* Password Input */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full appearance-none rounded-lg border border-gray-300 px-3 py-2.5 placeholder-gray-400 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-orange-500 sm:text-sm"
                  placeholder="••••••••"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
              </div>
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

            {message && message.includes("successful") && (
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
                onClick={handleRegister}
                disabled={loading}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 ${
                  loading
                    ? "bg-gray-400 cursor-not-allowed hover:transform-none"
                    : "bg-gray-900 hover:bg-gray-800 hover:shadow-lg"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
