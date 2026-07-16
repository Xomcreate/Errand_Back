import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "auto", folder: "uploads", ...options },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};