import Category from "../models/Category.js";
import cloudinary from "../config/cloudinary.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

// Build tree for nested categories
const buildCategoryTree = (categories, parentId = null) => {
  const tree = [];
  categories
    .filter((cat) => String(cat.parentId) === String(parentId))
    .forEach((cat) => {
      const children = buildCategoryTree(categories, cat._id);
      tree.push({ ...cat._doc, subCategories: children });
    });
  return tree;
};

// GET ALL
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    const tree = buildCategoryTree(categories);
    res.json(tree);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// CREATE
export const createCategory = async (req, res) => {
  try {
    const { name, isVisible, parentId } = req.body;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");

    let image = null;
    let imagePublicId = null;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: "categories" });
      image = result.secure_url;
      imagePublicId = result.public_id;
    }

    const category = new Category({ name, slug, isVisible, parentId, image, imagePublicId });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isVisible, parentId } = req.body;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");

    const existing = await Category.findById(id);
    if (!existing) return res.status(404).json({ message: "Category not found" });

    const updateData = { name, slug, isVisible, parentId };

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: "categories" });
      updateData.image = result.secure_url;
      updateData.imagePublicId = result.public_id;

      if (existing.imagePublicId) {
        await cloudinary.uploader.destroy(existing.imagePublicId).catch(() => {});
      }
    }

    const category = await Category.findByIdAndUpdate(id, updateData, { new: true });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Category.findByIdAndDelete(id);

    if (!deleted) return res.status(404).json({ message: "Category not found" });

    if (deleted.imagePublicId) {
      await cloudinary.uploader.destroy(deleted.imagePublicId).catch(() => {});
    }

    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};