const Category = require("../models/Category");

// Build tree for nested categories
const buildCategoryTree = (categories, parentId = null) => {
  const tree = [];
  categories
    .filter(cat => String(cat.parentId) === String(parentId))
    .forEach(cat => {
      const children = buildCategoryTree(categories, cat._id);
      tree.push({ ...cat._doc, subCategories: children });
    });
  return tree;
};

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    const tree = buildCategoryTree(categories);
    res.json(tree);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const { name, isVisible, parentId } = req.body;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const image = req.file ? req.file.path : null;

    const category = new Category({ name, slug, isVisible, parentId, image });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, isVisible, parentId } = req.body;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const image = req.file ? req.file.path : null;

    const category = await Category.findByIdAndUpdate(
      id,
      { name, slug, isVisible, parentId, ...(image && { image }) },
      { new: true }
    );

    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    await Category.findByIdAndDelete(id);
    res.json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};