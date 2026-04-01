import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";

// GET wishlist items for logged-in user
export const getWishlist = async (req, res) => {
  try {
    const wishlistItems = await Wishlist.find({ userId: req.user.id }).populate("productId");
    res.json(wishlistItems);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// ADD product to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    // Check if already in wishlist
    const existing = await Wishlist.findOne({ userId: req.user.id, productId });
    if (existing) return res.status(400).json({ message: "Item already in wishlist" });

    const item = await Wishlist.create({ userId: req.user.id, productId });
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// REMOVE product from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const wishlistItem = await Wishlist.findById(req.params.id);
    if (!wishlistItem) return res.status(404).json({ message: "Item not found" });
    if (wishlistItem.userId.toString() !== req.user.id) return res.status(403).json({ message: "Unauthorized" });

    await wishlistItem.remove();
    res.json({ message: "Item removed" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};