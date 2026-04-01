// backend/controllers/productController.js
import Product from "../models/Product.js"; // make sure your Product model uses ESM too

// Get all products
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().populate("category");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create product
export const createProduct = async (req, res) => {
  try {
    const { name, vendor, category } = req.body;
    if (!name || !vendor || !category)
      return res.status(400).json({ message: "Missing fields" });

    // Handle file path correctly
    const image = req.file ? req.file.path.replace(/\\/g, "/") : null;

    const newProduct = new Product({ name, vendor, category, image });
    await newProduct.save();

    res.status(201).json(newProduct);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (req.file) updates.image = req.file.path.replace(/\\/g, "/");

    const product = await Product.findByIdAndUpdate(id, updates, { new: true }).populate("category");
    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await Product.findByIdAndDelete(id);
    res.json({ message: "Product deleted" });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ message: error.message });
  }
};