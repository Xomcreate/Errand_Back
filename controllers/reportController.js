import Report from "../models/Report.js";
import nodemailer from "nodemailer";

const buildTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

// ================= CREATE REPORT =================
export const createReport = async (req, res) => {
  try {
    const { productLink, reportReason, details, contactEmail } = req.body;

    if (!productLink || !reportReason || !details) {
      return res.status(400).json({ msg: "Required fields missing" });
    }

    const report = await Report.create({
      productLink,
      reportReason,
      details,
      contactEmail: contactEmail || null,
    });

    // Respond immediately — email is best-effort and shouldn't block the user
    res.status(201).json({ msg: "Report submitted successfully", data: report });

    // ================= NOTIFY ADMIN =================
    try {
      const transporter = buildTransporter();

      const htmlMessage = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="background-color: #FF4500; color: #fff; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">New Product Report</h1>
          </div>
          <div style="padding: 20px; background-color: #fff; border: 1px solid #ddd; margin-top: 10px;">
            <p><b>Product Link:</b> <a href="${productLink}">${productLink}</a></p>
            <p><b>Reason:</b> ${reportReason}</p>
            <p><b>Details:</b><br/>${details}</p>
            <p><b>Reporter Email:</b> ${contactEmail || "Not provided"}</p>
            <p><b>Submitted:</b> ${new Date().toLocaleString()}</p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
            &copy; ${new Date().getFullYear()} ErrandBox Marketplace
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `"ErrandBox Marketplace" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        subject: `⚠️ New Product Report: ${reportReason}`,
        html: htmlMessage,
      });
    } catch (emailErr) {
      console.error("Report email failed:", emailErr.message);
    }
  } catch (error) {
    res.status(500).json({ msg: error.message });
  }
};

// ================= GET ALL REPORTS (admin) =================
export const getReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    return res.status(200).json(reports);
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

// ================= UPDATE REPORT STATUS =================
export const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["New", "In Progress", "Resolved", "Dismissed"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status" });
    }

    const report = await Report.findByIdAndUpdate(id, { status }, { new: true });
    if (!report) return res.status(404).json({ msg: "Report not found" });

    return res.status(200).json({ msg: "Status updated", report });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

// ================= DELETE REPORT =================
export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findByIdAndDelete(id);
    if (!report) return res.status(404).json({ msg: "Report not found" });

    return res.status(200).json({ msg: "Report deleted successfully" });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};