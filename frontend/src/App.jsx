import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './components/Home';

// Core Pages
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import VideoCall from './pages/VideoCall';

/**
 * DEV NOTE: This routing configuration includes the new Humble Home design (/)
 * along with the legacy system pages (Login, Dashboards, etc.) for the wider team.
 * All styling in the components directory is now strictly powered by Tailwind CSS.
 */
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
                <Route path="/video-call" element={<VideoCall />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
