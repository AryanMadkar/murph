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

    socket.on("offer", ({ roomId, sdp, caller }) => {
      socket.to(roomId).emit("offer", { sdp, caller, roomId });
    });

    socket.on("answer", ({ roomId, sdp, caller }) => {
      socket.to(roomId).emit("answer", { sdp, caller });
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      socket.to(roomId).emit("ice-candidate", { candidate });
    });

    // Chat Message Relay
    socket.on("send-message", (payload) => {
      const { roomId } = payload;

      socket.to(roomId).emit("receive-message", payload);
    });
  });

  return io;
};

module.exports = setupSocket;
