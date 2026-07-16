import multer from "multer";
import path from "path";

const storage = multer.memoryStorage();

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