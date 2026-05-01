import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import axios from "axios";

// ---------------------- REGISTER ----------------------
export const registerUser = async (req, res, next) => {
  try {
    const { role, name, storeName, email, phone, address,  categories, password, confirmPassword } = req.body;

    if (!password || password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    if (role === "buyer" && password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const user = await User.create({ role, name, storeName, email, phone, address, categories: categories ? (Array.isArray(categories) ? categories : [categories]) : ["General"], password });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: { id: user._id, role: user.role, name: user.name, email: user.email },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------- LOGIN ----------------------
export const loginUser = async (req, res, next) => {
  try {
    const { email = "", password = "" } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 🔥 CREATE JWT TOKEN (THIS WAS MISSING BEFORE)
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",

      // ✅ IMPORTANT: NOW FRONTEND WILL RECEIVE TOKEN
      token,

      role: user.role,

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
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

    const newPassword = Math.random().toString(36).slice(-8); // generate random 8-char password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await User.findByIdAndUpdate(id, { password: hashedPassword });

    // In real apps, send email. Here we just return for testing.
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

    const newStatus = user.status === "Active" ? "Blocked" : "Active";
    user.status = newStatus;
    await user.save();

    res.status(200).json({ message: `User status updated to ${newStatus}`, status: newStatus });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔥 FIX: prevent crash when req.body is undefined
    const body = req.body || {};

    user.name = body.name ?? user.name;
    user.phone = body.phone ?? user.phone;

    if (req.file) {
      user.profileImage = `/uploads/${req.file.filename}`;
    }

   if (user.role === "vendor") {
  user.storeName = body.storeName ?? user.storeName;
  user.address = body.address ?? user.address;

  // ✅ ADD THIS LINE
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

    res.status(200).json({
      message: "Profile updated successfully",
     user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

export const toggleVerification = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isVerified = !user.isVerified;
    await user.save();

    res.status(200).json({
      message: `Vendor ${user.isVerified ? "verified" : "unverified"}`,
      isVerified: user.isVerified,
    });
  } catch (error) {
    next(error);
  }
};

// GET LOGGED-IN USER (SELLER OR BUYER)
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};



const isTestMode = process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test");

// VERIFY BANK ACCOUNT
export const verifyBankAccount = async (req, res, next) => {
  try {
    const { accountNumber, bankCode } = req.query;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ message: "Account number and bank code are required" });
    }

    // ✅ TEST MODE: skip real verification, return dummy name
    if (isTestMode) {
      return res.json({
        success: true,
        accountName: "TEST ACCOUNT (Live mode will verify real name)",
      });
    }

    // LIVE MODE: real Paystack verification
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

// SAVE BANK DETAILS
export const saveBankDetails = async (req, res, next) => {
  try {
    const { accountNumber, bankCode } = req.body;

    if (!accountNumber || !bankCode) {
      return res.status(400).json({ message: "Account number and bank are required" });
    }

    let accountName = "TEST ACCOUNT";
    let recipientCode = `TEST_RECIPIENT_${Date.now()}`;

    if (isTestMode) {
      // ✅ TEST MODE: skip Paystack calls, save directly
      console.log("⚠ Test mode: skipping Paystack verification");
    } else {
      // LIVE MODE: verify and create recipient on Paystack
      const verify = await axios.get(
        `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
      );

      if (!verify.data.status) {
        return res.status(400).json({ message: "Could not verify account" });
      }

      accountName = verify.data.data.account_name;

      const recipient = await axios.post(
        "https://api.paystack.co/transferrecipient",
        {
          type: "nuban",
          name: accountName,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: "NGN",
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

// GET BANKS LIST
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