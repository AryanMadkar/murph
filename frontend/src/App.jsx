import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./components/Home";

// Core Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import VideoCall from "./pages/VideoCall";
import SessionReview from "./pages/SessionReview";
import Wallet from "./pages/Wallet";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Landing Page*/}
        <Route path="/" element={<Home />} /> 

        {/* Legacy System / Dashboard Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
        <Route path="/video-call/:roomId" element={<VideoCall />} />
        <Route path="/session-review/:sessionId" element={<SessionReview />} />
        <Route path="/wallet" element={<Wallet />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
