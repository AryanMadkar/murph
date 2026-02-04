const socketIO = require("socket.io");

// Track which user is in which socket
const userSocketMap = new Map();

// Store io instance for external access
let ioInstance = null;

// ⭐ Helper function to emit wallet update to a user
const emitWalletUpdate = (userId, data) => {
  if (!ioInstance) {
    console.warn("[Socket] IO instance not initialized");
    return false;
  }
  
  const socketId = userSocketMap.get(userId.toString());
  if (socketId) {
    ioInstance.to(socketId).emit("wallet-updated", data);
    console.log(`[Socket] Wallet update sent to user ${userId}:`, data);
    return true;
  } else {
    console.log(`[Socket] User ${userId} not connected, wallet update not sent`);
    return false;
  }
};

const setupSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store io instance for external access
  ioInstance = io;

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Register user socket (for targeted notifications)
    socket.on("register-user", (userId) => {
      userSocketMap.set(userId.toString(), socket.id);
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

    socket.on("session-ended", (payload) => {
      const { roomId } = payload;
      // Notify everyone else in the room that the session is officially over
      socket.to(roomId).emit("session-ended", payload);
      console.log(`Session ended in room ${roomId}`);
    });

    // ============= ATTENTION TRACKING EVENTS =============

    socket.on("attention-update", (payload) => {
      const {
        roomId,
        attentionScore,
        stabilityScore,
        centeringScore,
        faceDetected,
      } = payload;
      socket.to(roomId).emit("attention-score", {
        attentionScore,
        stabilityScore,
        centeringScore,
        faceDetected,
        timestamp: new Date(),
      });
      console.log(`Attention update for room ${roomId}: ${attentionScore}`);
    });

    socket.on("attention-alert", (payload) => {
      const { roomId, alertType, message } = payload;
      socket.to(roomId).emit("attention-alert-received", {
        alertType,
        message,
        timestamp: new Date(),
      });
    });

    socket.on("teacher-intervention", (payload) => {
      const { roomId, interventionType } = payload;
      console.log(
        `Teacher intervention in room ${roomId}: ${interventionType}`,
      );
      socket.to(roomId).emit("intervention-noted", {
        interventionType,
        timestamp: new Date(),
      });
    });

    socket.on("request-session-metrics", (payload) => {
      const { roomId } = payload;
      socket.emit("metrics-requested", {
        roomId,
        message: "Fetching session metrics...",
      });
    });
  });

  return io;
};

// Export the helper function and userSocketMap for external use
module.exports = setupSocket;
module.exports.emitWalletUpdate = emitWalletUpdate;
module.exports.userSocketMap = userSocketMap;
module.exports.getIO = () => ioInstance;
