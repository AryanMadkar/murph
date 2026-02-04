const socketIO = require("socket.io");

// Track which user is in which socket
const userSocketMap = new Map();

const setupSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Register user socket (for targeted notifications)
    socket.on("register-user", (userId) => {
      userSocketMap.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    // Meeting request notification (student -> teacher)
    socket.on("meeting-request", (payload) => {
      const { teacherId, studentEmail, meetingId } = payload;
      const teacherSocketId = userSocketMap.get(teacherId);
      if (teacherSocketId) {
        io.to(teacherSocketId).emit("new-meeting-request", {
          studentEmail,
          meetingId,
        });
        console.log(`Meeting request sent to teacher ${teacherId}`);
      }
    });

    // Meeting accepted notification (teacher -> student)
    socket.on("meeting-accepted", (payload) => {
      const { studentId, roomId } = payload;
      const studentSocketId = userSocketMap.get(studentId);
      if (studentSocketId) {
        io.to(studentSocketId).emit("meeting-accepted", { roomId });
        console.log(`Meeting accepted, notifying student ${studentId}`);
      }
    });

    // Join a video call room
    socket.on("join-room", (roomId, userId) => {
      console.log(`User ${userId} joined room ${roomId}`);
      socket.join(roomId);
      socket.to(roomId).emit("user-connected", userId);

      socket.on("disconnect", () => {
        console.log(`User ${userId} disconnected`);
        socket.to(roomId).emit("user-disconnected", userId);
        // Clean up user from map
        for (const [key, value] of userSocketMap.entries()) {
          if (value === socket.id) {
            userSocketMap.delete(key);
            break;
          }
        }
      });
    });

    // Relay WebRTC Offer
    socket.on("offer", (payload) => {
      socket.to(payload.roomId).emit("offer", payload);
    });

    // Relay WebRTC Answer
    socket.on("answer", (payload) => {
      socket.to(payload.roomId).emit("answer", payload);
    });

    // Relay ICE Candidate
    socket.on("ice-candidate", (payload) => {
      socket.to(payload.roomId).emit("ice-candidate", payload);
    });
  });

  return io;
};

module.exports = setupSocket;
