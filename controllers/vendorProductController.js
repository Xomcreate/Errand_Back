import VendorProduct from "../models/VendorProduct.js";

// ================= CREATE PRODUCT =================
export const createVendorProduct = async (req, res) => {
  try {
    const { name, category, price, stock } = req.body;

    const product = await VendorProduct.create({
      vendorId: req.user._id,
      name,
      category,
      price,
      stock,
      image: req.file ? `/uploads/${req.file.filename}` : "",
    });

    res.status(201).json({
      success: true,
      product,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= GET LOGGED-IN VENDOR PRODUCTS =================
export const getVendorProducts = async (req, res) => {
  try {
    const products = await VendorProduct.find({
      vendorId: req.user._id,
    });

    res.json({
      success: true,
      products,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= DELETE PRODUCT =================
export const deleteVendorProduct = async (req, res) => {
  try {
    await VendorProduct.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Vendor product deleted",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ================= NEW: PUBLIC STORE PRODUCTS =================
export const getVendorProductsByVendorId = async (req, res) => {
  try {
    const products = await VendorProduct.find({
      vendorId: req.params.id,
    });

    res.json({
      success: true,
      products,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};