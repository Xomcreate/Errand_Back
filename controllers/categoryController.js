const Category = require("../models/Category");

// Get all categories
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
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
    const { name, isVisible } = req.body;
    const slug = name.toLowerCase().trim().replace(/\s+/g, "-");
    const image = req.file ? req.file.path : null;

    const category = await Category.findByIdAndUpdate(
      id,
      { name, slug, isVisible, ...(image && { image }) },
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