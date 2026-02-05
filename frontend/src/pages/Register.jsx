import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Toast from "../components/Toast";

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("student");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [category, setCategory] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [toastType, setToastType] = useState("info");
  const [showToast, setShowToast] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // Auto-redirect if already logged in
  useEffect(() => {
    const userData = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (userData && userData !== "undefined" && token) {
      try {
        const user = JSON.parse(userData);
        if (user) {
          navigate(
            user.role === "teacher"
              ? "/teacher-dashboard"
              : "/student-dashboard",
          );
        }
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }
  }, [navigate]);

  const showNotification = (msg, type) => {
    setMessage(msg);
    setToastType(type);
    setShowToast(true);
  };

  const handleRegister = async () => {
    if (!email || !password || !name) {
      showNotification("Please fill in all required fields", "error");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNotification("Please enter a valid email address", "error");
      return;
    }

    setLoading(true);
    setShowToast(false);

    try {
      const response = await axios.post(`${API_URL}/register`, {
        name,
        email,
        password,
        role,
        age: parseInt(age),
        bio,
        interests,
        specialization,
        category,
        hourlyRate: parseInt(hourlyRate * 100), // Convert to paise
      });

      if (response.data.status === "success" || response.data.token) {
        showNotification("Registration successful! Redirecting...", "success");
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
      showNotification(err.response?.data?.message || err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showToast && (
        <Toast
          message={message}
          type={toastType}
          onClose={() => setShowToast(false)}
        />
      )}
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-['Source_Sans_Pro'] relative">
        <Link
          to="/"
          className="absolute top-8 left-8 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-all group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" strokeWidth={1.5} />
          Back to Home
        </Link>
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

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
          <div className="bg-white py-8 px-4 shadow-xl shadow-gray-100 sm:rounded-2xl sm:px-10 border border-gray-100">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Basic Info */}
                <div className="space-y-4">
                  {/* Role Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      I am a...
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRole("student")}
                        className={`flex justify-center py-2.5 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${role === "student"
                          ? "bg-gray-900 text-white shadow-md"
                          : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                          }`}
                      >
                        Student
                      </button>
                      <button
                        type="button"
                        onClick={() => setRole("teacher")}
                        className={`flex justify-center py-2.5 px-4 rounded-lg text-sm font-semibold transition-all cursor-pointer ${role === "teacher"
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
                    <input
                      id="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                      placeholder="John Doe"
                    />
                  </div>

                  {/* Email Input */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                      placeholder="you@example.com"
                    />
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
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" strokeWidth={1.5} />
                        ) : (
                          <Eye className="h-5 w-5" strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Profile Detailing */}
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="age"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Age
                    </label>
                    <input
                      id="age"
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                      placeholder="20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bio"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Bio / About Me
                    </label>
                    <textarea
                      id="bio"
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                      placeholder="Tell us about yourself..."
                    />
                  </div>

                  {role === "student" ? (
                    <div>
                      <label
                        htmlFor="interests"
                        className="block text-sm font-medium text-gray-700"
                      >
                        Interests (comma separated)
                      </label>
                      <input
                        id="interests"
                        type="text"
                        value={interests}
                        onChange={(e) => setInterests(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                        placeholder="Math, AI, Music..."
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label
                          htmlFor="specialization"
                          className="block text-sm font-medium text-gray-700"
                        >
                          Specialization
                        </label>
                        <input
                          id="specialization"
                          type="text"
                          value={specialization}
                          onChange={(e) => setSpecialization(e.target.value)}
                          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                          placeholder="Expert in Machine Learning"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="category"
                            className="block text-sm font-medium text-gray-700"
                          >
                            Category
                          </label>
                          <select
                            id="category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                          >
                            <option value="">Select</option>
                            <option value="Programming">Programming</option>
                            <option value="Math">Math</option>
                            <option value="Science">Science</option>
                            <option value="Design">Design</option>
                            <option value="Business">Business</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="rate"
                            className="block text-sm font-medium text-gray-700"
                          >
                            Hourly Rate ($)
                          </label>
                          <input
                            id="rate"
                            type="number"
                            value={hourlyRate}
                            onChange={(e) => setHourlyRate(e.target.value)}
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 placeholder-gray-400 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={loading}
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white transition-all transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 ${loading
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
    </>
  );
}
