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
import Explore from "./pages/Explore";
import MySessions from "./pages/MySessions";
import VirtualTeacher from "./pages/VirtualTeacher";
import DashboardLayout from "./components/DashboardLayout";
import TeacherLayout from "./components/TeacherLayout";
import TeacherUpload from "./pages/TeacherUpload";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Main Landing Page*/}
        <Route path="/" element={<Home />} />

        {/* Legacy System / Dashboard Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        {/* Student Dashboard & Pages (with persistent sidebar) */}
        <Route element={<DashboardLayout />}>
          <Route path="/student-dashboard" element={<StudentDashboard />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/my-sessions" element={<MySessions />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/virtual-teacher" element={<VirtualTeacher />} />
        </Route>

        {/* Teacher Dashboard & Pages (with persistent sidebar) */}
        <Route element={<TeacherLayout />}>
          <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/upload" element={<TeacherUpload />} />
          <Route path="/teacher/wallet" element={<Wallet />} />
        </Route>

        {/* Video Call Route (Full Screen) */}
        <Route path="/video-call/:roomId" element={<VideoCall />} />

        {/* Post-Session Review */}
        <Route path="/session-review/:sessionId" element={<SessionReview />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
