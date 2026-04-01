// models/Contact.js
const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String },
    message: { type: String, required: true },
    status: { 
      type: String, 
      enum: ["New", "In Progress", "Completed"], 
      default: "New" 
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Contact", contactSchema);
