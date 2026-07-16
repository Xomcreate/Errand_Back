import SellerInquiry from "../models/SellerInquiry.js";
import nodemailer from "nodemailer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/uploadToCloudinary.js");

// -------------------- Nodemailer Transport --------------------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// -------------------- Submit New Inquiry --------------------
export const submitInquiry = async (req, res) => {
  try {
    const { name, email, phone, category, description } = req.body;

    let fileUrl = null;
    let filePublicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `${Date.now()}-${req.file.originalname.split(".")[0]}`,
      });
      fileUrl = result.secure_url;
      filePublicId = result.public_id;
    }

    const inquiry = await SellerInquiry.create({
      name,
      email,
      phone,
      category,
      description,
      fileUrl,
      filePublicId,
    });

    return res.status(201).json({
      success: true,
      msg: "Seller inquiry saved!",
      data: inquiry,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, msg: err.message });
  }
};

// -------------------- Get All Inquiries --------------------
export const getAllInquiries = async (req, res) => {
  try {
    const inquiries = await SellerInquiry.find().sort({ createdAt: -1 });
    return res.status(200).json(inquiries);
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};

// -------------------- Delete Single Inquiry --------------------
export const deleteInquiry = async (req, res) => {
  try {
    const inquiry = await SellerInquiry.findById(req.params.id);
    if (!inquiry) {
      return res.status(404).json({ success: false, msg: "Inquiry not found" });
    }

    if (inquiry.filePublicId) {
      try {
        await deleteFromCloudinary(inquiry.filePublicId);
      } catch (cloudErr) {
        console.error("Cloudinary delete failed:", cloudErr.message);
      }
    }

    await SellerInquiry.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};

// -------------------- Delete ALL Inquiries --------------------
export const deleteAllInquiries = async (req, res) => {
  try {
    const inquiries = await SellerInquiry.find({ filePublicId: { $ne: null } });

    await Promise.all(
      inquiries.map((inq) =>
        inq.filePublicId
          ? deleteFromCloudinary(inq.filePublicId).catch((e) =>
              console.error(`Cloudinary delete failed for ${inq.filePublicId}:`, e.message)
            )
          : Promise.resolve()
      )
    );

    const result = await SellerInquiry.deleteMany({});

    return res.status(200).json({
      success: true,
      msg: `Deleted ${result.deletedCount} inquiries.`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, msg: err.message });
  }
};

// -------------------- Mark as Contacted --------------------
export const markContacted = async (req, res) => {
  try {
    const inquiry = await SellerInquiry.findByIdAndUpdate(
      req.params.id,
      { status: "Contacted" },
      { new: true }
    );
    return res.status(200).json({ success: true, data: inquiry });
  } catch (err) {
    return res.status(500).json({ success: false, msg: err.message });
  }
};

// -------------------- Reply via Email --------------------
export const replyInquiry = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, msg: "Message is required" });

    const inquiry = await SellerInquiry.findByIdAndUpdate(
      req.params.id,
      { status: "Contacted" },
      { new: true }
    );

    await transporter.sendMail({
      from: `"Errandbox Marketplace" <${process.env.GMAIL_USER}>`,
      to: inquiry.email,
      subject: "Response to Your Seller Inquiry",
      html: `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; border:2px solid #FF4500; border-radius:10px; overflow:hidden;">
          <div style="background-color:#FF4500; color:white; padding:20px; text-align:center;">
            <h2>Errandbox Marketplace</h2>
          </div>
          <div style="padding:20px; color:#333;">
            <p>Hi <strong>${inquiry.name}</strong>,</p>
            <p>${message}</p>
            <p>Thank you for reaching out to Errandbox Marketplace. We look forward to supporting your business!</p>
            <p style="margin-top:30px;">— The Errandbox Marketplace Team</p>
          </div>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      msg: "Reply sent via email successfully!",
      data: inquiry,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, msg: err.message });
  }
};