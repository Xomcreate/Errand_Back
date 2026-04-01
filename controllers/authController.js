import User from "../models/User.js";
import bcrypt from "bcryptjs";

// ---------------------- REGISTER ----------------------
export const registerUser = async (req, res, next) => {
  try {
    const { role, name, storeName, email, phone, address, password, confirmPassword } = req.body;

    if (!password || password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });

    if (role === "buyer" && password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered" });

    const user = await User.create({ role, name, storeName, email, phone, address, password });

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

    if (!email || !password)
      return res.status(400).json({ message: "Please provide email and password" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
res.status(200).json({
  success: true,
  message: "Login successful",
  role: user.role,
  user: { 
    id: user._id, 
    name: user.name, 
    email: user.email, 
    phone: user.phone // <-- include this
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
    const { name, phone } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { name, phone },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Profile updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    next(error);
  }
};

