import Job from "../models/Job.js";
import Application from "../models/Application.js";
import nodemailer from "nodemailer";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier"; // npm install streamifier

// Helper: upload a memory buffer to Cloudinary and resolve with the result
const uploadBufferToCloudinary = (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "cv-uploads",
        resource_type: "auto", // critical: "auto" lets pdf/doc/docx upload correctly
        public_id: originalname.replace(/\.[^/.]+$/, ""),
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// ================= CREATE JOB =================
export const createJob = async (req, res) => {
  try {
    const job = await Job.create(req.body);
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET ALL JOBS =================
export const getJobs = async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= UPDATE JOB =================
export const updateJob = async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DELETE JOB =================
export const deleteJob = async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: "Job deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= APPLY JOB =================
export const applyJob = async (req, res) => {
  let applicationSaved = false;

  try {
    const { jobId, fullName, email, phone, coverLetter } = req.body;

    if (!jobId || !fullName || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const job = await Job.findById(jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    if (!job.email) {
      return res.status(400).json({ message: "Job owner email is missing" });
    }

    // ================= CV FILE: upload buffer to Cloudinary =================
    let cvUrl = null;
    let cvOriginalName = null;

    if (req.file) {
      try {
        const result = await uploadBufferToCloudinary(
          req.file.buffer,
          req.file.originalname
        );
        cvUrl = result.secure_url;
        cvOriginalName = req.file.originalname;
      } catch (uploadErr) {
        console.error("Cloudinary upload failed:", uploadErr);
        return res
          .status(500)
          .json({ message: "CV upload failed. Please try again." });
      }
    }

    // ================= SAVE APPLICATION =================
    await Application.create({
      jobId,
      fullName,
      email,
      phone,
      coverLetter,
      cvFile: cvUrl,
    });
    applicationSaved = true;

    job.applicants += 1;
    await job.save();

    res.json({ message: "Application submitted successfully" });

    // ================= EMAIL (fire-and-forget) =================
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });

      const attachments = req.file
        ? [{ filename: req.file.originalname, content: req.file.buffer }]
        : [];

      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: job.email,
        subject: `New Application - ${job.title}`,
        attachments,
        html: `
          <h2>New Job Application</h2>
          <p><b>Job:</b> ${job.title}</p>
          <p><b>Name:</b> ${fullName}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Phone:</b> ${phone || "N/A"}</p>
          <p><b>Cover Letter:</b> ${coverLetter || "N/A"}</p>
          <p>${cvUrl ? `✅ CV: <a href="${cvUrl}">${cvOriginalName}</a>` : "No CV uploaded."}</p>
        `,
      });

      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: process.env.GMAIL_USER,
        subject: "New Job Application Alert",
        attachments,
        html: `
          <h3>New Applicant</h3>
          <p><b>Name:</b> ${fullName}</p>
          <p><b>Job:</b> ${job.title}</p>
          <p>${cvUrl ? `✅ CV: <a href="${cvUrl}">${cvOriginalName}</a>` : "No CV uploaded."}</p>
        `,
      });
    } catch (emailErr) {
      console.error("Apply job - email send failed:", emailErr.message);
    }
  } catch (err) {
    console.error("Apply job error:", err);
    if (!applicationSaved) {
      res.status(500).json({ message: err.message });
    }
  }
};