import Job from "../models/Job.js";
import Application from "../models/Application.js";
import nodemailer from "nodemailer";

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
 
    // ================= CV FILE =================
    const cvFile = req.file || null;
 
    // ================= SAVE APPLICATION =================
    await Application.create({
      jobId,
      fullName,
      email,
      phone,
      coverLetter,
      cvFile: cvFile ? cvFile.path : null,
    });
 
    // ================= EMAIL SETUP =================
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
 
    // ✅ Attach the actual file to the email — works locally AND in production
    const attachments = cvFile
      ? [{ filename: cvFile.originalname, path: cvFile.path }]
      : [];
 
    // ================= EMAIL TO EMPLOYER =================
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
        <p>${cvFile ? "✅ CV is attached to this email." : "No CV uploaded."}</p>
      `,
    });
 
    // ================= EMAIL TO YOURSELF =================
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: "New Job Application Alert",
      attachments,
      html: `
        <h3>New Applicant</h3>
        <p><b>Name:</b> ${fullName}</p>
        <p><b>Job:</b> ${job.title}</p>
        <p>${cvFile ? "✅ CV is attached to this email." : "No CV uploaded."}</p>
      `,
    });
 
    // ================= UPDATE APPLICANT COUNT =================
    job.applicants += 1;
    await job.save();
 
    res.json({ message: "Application submitted successfully" });
  } catch (err) {
    console.error("Apply job error:", err);
    res.status(500).json({ message: err.message });
  }
};
 