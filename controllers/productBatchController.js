import Product from "../models/Product.js";
import VendorProduct from "../models/VendorProduct.js";

// POST /api/products/batch
// Body: { ids: ["id1", "id2", ...] }
// Returns only the products that match the given IDs — not the whole catalog.
export const getProductsBatch = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.json({ platformProducts: [], vendorProducts: [] });
    }

    const [platformProducts, vendorProducts] = await Promise.all([
      Product.find({ _id: { $in: ids } }).select("_id name price"),
      VendorProduct.find({ _id: { $in: ids } }).select("_id name price"),
    ]);

    return res.json({ platformProducts, vendorProducts });
  } catch (err) {
    console.error("Batch product fetch error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};