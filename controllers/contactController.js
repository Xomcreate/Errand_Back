const Contact = require("../models/Contact");
const nodemailer = require("nodemailer");

// CREATE CONTACT
exports.createContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message)
      return res.status(400).json({ msg: "Required fields missing" });

    const contact = await Contact.create({ name, email, subject, message });
    return res.status(201).json({ msg: "Message submitted successfully", data: contact });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

// GET ALL MESSAGES
exports.getMessages = async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    return res.status(200).json(messages);
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

// DELETE MESSAGE
exports.deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await Contact.findByIdAndDelete(id);
    if (!message) return res.status(404).json({ msg: "Message not found" });

    return res.status(200).json({ msg: "Message deleted successfully" });
  } catch (error) {
    return res.status(500).json({ msg: error.message });
  }
};

// REPLY TO MESSAGE VIA HTML EMAIL
exports.replyToMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { replyMessage } = req.body;
    if (!replyMessage) return res.status(400).json({ msg: "Reply message is required" });

    const contact = await Contact.findById(id);
    if (!contact) return res.status(404).json({ msg: "Message not found" });

    // Nodemailer transport using Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // HTML Email template
    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="background-color: #FF4500; color: #fff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">ErrandBox Marketplace Support</h1>
        </div>

        <div style="padding: 20px; background-color: #fff; border: 1px solid #ddd; margin-top: 10px;">
          <p>Hi <strong>${contact.name}</strong>,</p>

          <p>${replyMessage}</p>

          <p style="margin-top: 20px;">Best regards,<br/>
          <span style="color: #FF4500; font-weight: bold;">ErrandBox Marketplace Support</span></p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #888; font-size: 12px;">
          &copy; ${new Date().getFullYear()} ErrandBox Marketplace
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"ErrandBox Marketplace Support" <${process.env.GMAIL_USER}>`,
      to: contact.email,
      subject: `Reply: ${contact.subject || "No Subject"}`,
      html: htmlMessage,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({ msg: "Reply sent successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: "Failed to send reply" });
  }
};

// Update Status
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["New", "In Progress", "Completed"].includes(status)) {
      return res.status(400).json({ msg: "Invalid status" });
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!contact) return res.status(404).json({ msg: "Message not found" });

    return res.status(200).json({ msg: "Status updated", contact });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: error.message });
  }
};