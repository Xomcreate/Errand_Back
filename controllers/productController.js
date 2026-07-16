import Product from "../models/Product.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

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

// CREATE PRODUCT (Cloudinary)
export const createProduct = async (req, res) => {
  try {
    const { name, description, brand, category } = req.body;

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

    let image = null;
    let imagePublicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: "products" });
      image = result.secure_url;
      imagePublicId = result.public_id;
    }

    const newProduct = new Product({
      name,
      description,
      brand,
      category,
      price,
      oldPrice,
      image,
      imagePublicId,
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

// UPDATE PRODUCT (Cloudinary — replaces old image if a new one is uploaded)
export const updateProduct = async (req, res) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Product not found" });

    const updates = { ...req.body };

    if (updates.price) updates.price = Number(updates.price);
    if (updates.oldPrice) updates.oldPrice = Number(updates.oldPrice);
    if (updates.dealPrice) updates.dealPrice = Number(updates.dealPrice);

    updates.isFlashSale = updates.isFlashSale === "true";
    updates.isDealOfTheDay = updates.isDealOfTheDay === "true";
    updates.isTrending = updates.isTrending === "true";

    if (updates.dealEnds) {
      updates.dealEnds = new Date(updates.dealEnds);
    }

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: "products" });
      updates.image = result.secure_url;
      updates.imagePublicId = result.public_id;

      // clean up the old Cloudinary image
      if (existing.imagePublicId) {
        await cloudinary.uploader.destroy(existing.imagePublicId).catch(() => {});
      }
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    }).populate("category");

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE ONE PRODUCT (also removes its Cloudinary image)
export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found" });

    if (deleted.imagePublicId) {
      await cloudinary.uploader.destroy(deleted.imagePublicId).catch(() => {});
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE ALL PRODUCTS (also wipes their Cloudinary images)
export const deleteAllProducts = async (req, res) => {
  try {
    const products = await Product.find({}, "imagePublicId");

    const publicIds = products.map((p) => p.imagePublicId).filter(Boolean);

    if (publicIds.length > 0) {
      // Cloudinary allows deleting up to 100 resources per call — batch it
      const batchSize = 100;
      for (let i = 0; i < publicIds.length; i += batchSize) {
        const batch = publicIds.slice(i, i + batchSize);
        await cloudinary.api.delete_resources(batch).catch(() => {});
      }
    }

    const result = await Product.deleteMany({});

    res.json({
      message: "All products deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};