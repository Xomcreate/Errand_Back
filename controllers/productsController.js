import Product from "../models/Product.js"; // Mongoose model

// Get all products
export const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find(); // optionally add filters later
    res.status(200).json({ success: true, products });
  } catch (err) {
    next(err);
  }
};