import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — generate JWT (same config as login)
// ─────────────────────────────────────────────────────────────────────────────
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ---------------------- REGISTER ----------------------
export const registerUser = async (req, res, next) => {
  try {
    const {
      role, name, storeName, email, phone,
      address, categories, password, confirmPassword,
    } = req.body;

    if (!password || password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    if (role === "buyer" && password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const user = await User.create({
      role,
      name,
      storeName,
      email,
      phone,
      address,
      categories: categories
        ? Array.isArray(categories) ? categories : [categories]
        : ["General"],
      password,
    });

    // FIX — return a token on register so the frontend can immediately call
    // POST /referrals/register (which requires auth) without a separate login.
    // Without this token, referral documents are never created and wallets
    // are never funded.
    const token = generateToken(user._id, user.role);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id:    user._id,
        role:  user.role,
        name:  user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- LOGIN ----------------------
export const loginUser = async (req, res, next) => {
  try {
    const { email = "", password = "" } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Please provide email and password" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    const token = generateToken(user._id, user.role);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      role: user.role,
      user: {
        id:           user._id,
        name:         user.name,
        email:        user.email,
        phone:        user.phone,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- GET ALL USERS ----------------------
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json({ users });
  } catch (error) {
    next(error);
  }
};

// ---------------------- DELETE USER ----------------------
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};

// ---------------------- RESET PASSWORD ----------------------
export const resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const newPassword    = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(id, { password: hashedPassword });
    res.status(200).json({ message: "Password reset successfully", newPassword });
  } catch (error) {
    next(error);
  }
};

// ---------------------- TOGGLE STATUS ----------------------
export const toggleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.status = user.status === "Active" ? "Blocked" : "Active";
    await user.save();

    res.status(200).json({ message: `User status updated to ${user.status}`, status: user.status });
  } catch (error) {
    next(error);
  }
};

// ---------------------- UPDATE PROFILE ----------------------
export const updateProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const body = req.body || {};

    user.name  = body.name  ?? user.name;
    user.phone = body.phone ?? user.phone;

    // ── Cloudinary upload ────────────────────────────────────────────────
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: "profile-images",
        });
        user.profileImage = result.secure_url;
      } catch (uploadErr) {
        console.error("CLOUDINARY UPLOAD ERROR:", uploadErr);
        return res.status(500).json({ message: "Image upload failed" });
      }
    }

    if (user.role === "vendor") {
      user.storeName   = body.storeName   ?? user.storeName;
      user.address     = body.address     ?? user.address;
      user.description = body.description ?? user.description;

      if (body.categories) {
        user.categories =
          typeof body.categories === "string"
            ? JSON.parse(body.categories)
            : body.categories;
      }

      if (body.businessHours) {
        user.businessHours =
          typeof body.businessHours === "string"
            ? JSON.parse(body.businessHours)
            : body.businessHours;
      }
    }

    const updatedUser = await user.save();
    res.status(200).json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    next(error);
  }
};

// ---------------------- TOGGLE VERIFICATION ----------------------
// Manual override — kept for cases where an admin wants to verify/unverify
// a vendor outside of the KYC flow (e.g. legacy vendors onboarded before KYC).
export const toggleVerification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isVerified = !user.isVerified;
    await user.save();

    res.status(200).json({
      message:    `Vendor ${user.isVerified ? "verified" : "unverified"}`,
      isVerified: user.isVerified,
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- GET ME ----------------------
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// KYC
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------- SUBMIT KYC (vendor) ----------------------
export const submitKyc = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "vendor")
      return res.status(403).json({ message: "Only vendors can submit KYC" });

    const { idType, idNumber } = req.body;
    if (!idType || !idNumber)
      return res.status(400).json({ message: "ID type and ID number are required" });

    const documentFile = req.files?.document?.[0];
    const selfieFile    = req.files?.selfie?.[0];

    if (!documentFile)
      return res.status(400).json({ message: "Please upload a photo of your ID document" });

    let documentUrl = user.kyc?.documentUrl || "";
    let selfieUrl    = user.kyc?.selfieUrl    || "";

    try {
      const docResult = await uploadToCloudinary(documentFile.buffer, { folder: "kyc-documents" });
      documentUrl = docResult.secure_url;

      if (selfieFile) {
        const selfieResult = await uploadToCloudinary(selfieFile.buffer, { folder: "kyc-selfies" });
        selfieUrl = selfieResult.secure_url;
      }
    } catch (uploadErr) {
      console.error("KYC CLOUDINARY UPLOAD ERROR:", uploadErr);
      return res.status(500).json({ message: "Document upload failed" });
    }

    user.kyc = {
      idType,
      idNumber,
      documentUrl,
      selfieUrl,
      status:          "Pending",
      rejectionReason: "",
      submittedAt:     new Date(),
      reviewedAt:      null,
    };

    await user.save();
    res.status(200).json({ success: true, message: "KYC submitted for review", kyc: user.kyc });
  } catch (error) {
    next(error);
  }
};

// ---------------------- GET PENDING KYC SUBMISSIONS (admin) ----------------------
export const getPendingKyc = async (req, res, next) => {
  try {
    const vendors = await User.find({ role: "vendor", "kyc.status": "Pending" })
      .select("-password")
      .sort({ "kyc.submittedAt": 1 });
    res.status(200).json({ success: true, vendors });
  } catch (error) {
    next(error);
  }
};

// ---------------------- REVIEW KYC — approve/reject (admin) ----------------------
// Approving is what makes the vendor "Verified" — isVerified flips to true here.
export const reviewKyc = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, rejectionReason } = req.body; // "approve" | "reject"

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.kyc || user.kyc.status !== "Pending")
      return res.status(400).json({ message: "No pending KYC submission for this user" });

    if (decision === "approve") {
      user.kyc.status          = "Approved";
      user.kyc.reviewedAt      = new Date();
      user.kyc.rejectionReason = "";
      user.isVerified          = true;
    } else if (decision === "reject") {
      user.kyc.status          = "Rejected";
      user.kyc.reviewedAt      = new Date();
      user.kyc.rejectionReason = rejectionReason || "Submitted documents could not be verified";
      user.isVerified          = false;
    } else {
      return res.status(400).json({ message: "decision must be 'approve' or 'reject'" });
    }

    await user.save();
    res.status(200).json({
      success:    true,
      message:    `KYC ${decision}d`,
      kyc:        user.kyc,
      isVerified: user.isVerified,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
const isTestMode = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test");

// ---------------------- VERIFY BANK ACCOUNT ----------------------
export const verifyBankAccount = async (req, res, next) => {
  try {
    const { accountNumber, bankCode } = req.query;

    if (!accountNumber || !bankCode)
      return res.status(400).json({ message: "Account number and bank code are required" });

    if (isTestMode) {
      return res.json({
        success:     true,
        accountName: "TEST ACCOUNT (Live mode will verify real name)",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    if (response.data.status) {
      res.json({ success: true, accountName: response.data.data.account_name });
    } else {
      res.status(400).json({ success: false, message: "Account not found" });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: "Could not verify account" });
  }
};

// ---------------------- SAVE BANK DETAILS ----------------------
export const saveBankDetails = async (req, res, next) => {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode)
      return res.status(400).json({ message: "Account number and bank are required" });

    let accountName  = "TEST ACCOUNT";
    let recipientCode = `TEST_RECIPIENT_${Date.now()}`;

    if (isTestMode) {
      console.log("⚠ Test mode: skipping Paystack verification");
    } else {
      const verify = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      if (!verify.data.status)
        return res.status(400).json({ message: "Could not verify account" });

      accountName = verify.data.data.account_name;

      const recipient = await axios.post(
        "https://api.paystack.co/transferrecipient",
        {
          type:           "nuban",
          name:           accountName,
          account_number: accountNumber,
          bank_code:      bankCode,
          currency:       "NGN",
        },
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      recipientCode = recipient.data.data.recipient_code;
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { bankDetails: { accountNumber, bankCode, accountName, recipientCode } },
      { new: true }
    ).select("-password");

    res.json({ success: true, message: "Bank details saved", bankDetails: user.bankDetails });
  } catch (err) {
    console.error("BANK DETAILS ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to save bank details" });
  }
};

// ---------------------- GET BANKS LIST ----------------------
export const getBanksList = async (req, res, next) => {
  try {
    const response = await axios.get("https://api.paystack.co/bank?currency=NGN", {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    res.json({ success: true, banks: response.data.data });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch banks" });
  }
};

// ---------------------- GET VENDOR BANK DETAILS (admin) ----------------------
// Used by the admin payout screen to pull a vendor's saved, Paystack-verified
// bank account instead of requiring the admin to type one in manually.
export const getVendorBankDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("name storeName bankDetails");
    if (!user) return res.status(404).json({ message: "Vendor not found" });

    if (!user.bankDetails?.accountNumber) {
      return res.status(404).json({ message: "This vendor has not added their bank details yet" });
    }

    res.json({ success: true, bankDetails: user.bankDetails });
  } catch (error) {
    next(error);
  }
};