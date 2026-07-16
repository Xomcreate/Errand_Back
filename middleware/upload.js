import multer from "multer";
import path from "path";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js"; // adjust path if your config file lives elsewhere

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    allowed_formats: ["jpg", "jpeg", "png", "pdf", "doc", "docx"],
    resource_type: "auto", // required so pdf/doc files upload correctly, not just images
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExt = /pdf|doc|docx|jpeg|jpg|png/;
  const extname = allowedExt.test(path.extname(file.originalname).toLowerCase());
  const mimetype =
    /application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image\/jpeg|image\/jpg|image\/png/.test(
      file.mimetype
    );

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, DOC, DOCX, JPG, JPEG, and PNG files are allowed"));
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});