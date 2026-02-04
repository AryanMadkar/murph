const mongoose = require("mongoose");
require("dotenv").config();

const dropOldIndex = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const User = mongoose.connection.collection("users");

    // Drop the old name_1 index
    await User.dropIndex("name_1");
    console.log("✅ Successfully dropped 'name_1' index");

    await mongoose.connection.close();
    console.log("Connection closed");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
};

dropOldIndex();
