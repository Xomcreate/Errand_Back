require("dotenv").config();
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Ping Cloudinary to confirm the connection/credentials actually work
cloudinary.api.ping((error, result) => {
  if (error) {
    console.error("❌ Cloudinary connection failed:", error.message);
  } else {
    console.log("✅ Cloudinary connected:", result);
  }
});

module.exports = cloudinary;