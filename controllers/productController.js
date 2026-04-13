import Product from "../models/Product.js";

// GET ALL PRODUCTS
export const getProducts = async (req, res) => {
  try {
    const { category } = req.query;

    let filter = {};
    if (category) filter.category = category;

    const products = await Product.find(filter)
      .populate("category")
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET SINGLE
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CREATE PRODUCT (FIXED)
export const createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      brand,
      category,
    } = req.body;

    const price = Number(req.body.price);
    const oldPrice = req.body.oldPrice ? Number(req.body.oldPrice) : null;

    const isFlashSale = req.body.isFlashSale === "true";
    const isDealOfTheDay = req.body.isDealOfTheDay === "true";
    const isTrending = req.body.isTrending === "true";

    const dealPrice = req.body.dealPrice ? Number(req.body.dealPrice) : null;
    const dealEnds = req.body.dealEnds ? new Date(req.body.dealEnds) : null;

    if (!name || !brand || !category || !price) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const image = req.file ? req.file.path.replace(/\\/g, "/") : null;

    const newProduct = new Product({
      name,
      description,
      brand,
      category,
      price,
      oldPrice,
      image,
      isFlashSale,
      isDealOfTheDay,
      isTrending,
      dealPrice,
      dealEnds,
    });

    await newProduct.save();

    const populated = await newProduct.populate("category");

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE PRODUCT (FIXED SAME LOGIC)
export const updateProduct = async (req, res) => {
  try {
    const updates = req.body;

    if (req.file) {
      updates.image = req.file.path.replace(/\\/g, "/");
    }

    if (updates.price) updates.price = Number(updates.price);
    if (updates.oldPrice) updates.oldPrice = Number(updates.oldPrice);
    if (updates.dealPrice) updates.dealPrice = Number(updates.dealPrice);

    updates.isFlashSale = updates.isFlashSale === "true";
    updates.isDealOfTheDay = updates.isDealOfTheDay === "true";
    updates.isTrending = updates.isTrending === "true";

    if (updates.dealEnds) {
      updates.dealEnds = new Date(updates.dealEnds);
    }

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    ).populate("category");

    if (!updated) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE
export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};